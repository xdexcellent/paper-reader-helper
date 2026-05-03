from __future__ import annotations

import io
import json
import logging
import re
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse


import httpx
from sqlmodel import Session, select

from app.core.db import engine
from app.services.http_client_factory import get_http_client
from app.core.timezone import get_timezone
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.subscription import Subscription
from app.services.automation_settings_service import AutomationSettingsService
from app.services.category_service import initialize_pending_category
from app.services.daily_briefing_service import DailyBriefingService
from app.services.pipeline import PaperPipelineService
from app.services.source_adapters.base import SourceCandidate
from app.services.source_adapters.registry import get_adapter
from app.services.storage import StorageService

logger = logging.getLogger(__name__)
PENDING_REASON = "Waiting for summary and automatic classification."
INITIAL_STATS = {
    "subscriptions_total": 0,
    "candidates_total": 0,
    "projects_found": 0,
    "papers_imported": 0,
    "deduplicated": 0,
    "failed_items": 0,
    "processed_papers": 0,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _format_fetch_error_message(exc: Exception) -> str:
    message = str(exc)
    lowered = message.lower()
    if "10061" in message or "actively refused" in lowered:
        return (
            "连接外部服务失败（WinError 10061）。"
            "请确认自动化设置中的代理地址可用，并且本地代理程序已经启动。"
            f" 原始错误：{message}"
        )
    return message


def _record_subscription_issue(
    stats: dict,
    subscription: Subscription,
    *,
    severity: str,
    message: str,
) -> None:
    issues = stats.setdefault("subscription_issues", [])
    if not isinstance(issues, list):
        issues = []
        stats["subscription_issues"] = issues
    issues.append(
        {
            "subscription_id": subscription.id,
            "subscription_name": subscription.name,
            "source_kind": subscription.source_kind or subscription.type,
            "severity": severity,
            "message": message,
        }
    )


def _normalize_title(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _same_datetime(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is right
    return _as_utc(left) == _as_utc(right)


def _build_storage_filename(candidate: SourceCandidate) -> str:
    filename = Path(urlparse(candidate.pdf_url).path).name
    if not filename:
        seed = candidate.external_id or candidate.title or "downloaded"
        filename = re.sub(r"[^A-Za-z0-9._-]+", "-", seed)
    return filename if filename.lower().endswith(".pdf") else f"{filename}.pdf"


class DailyIngestionService:
    def __init__(
        self,
        session: Session | None = None,
        *,
        adapter_resolver: Callable[[str], object] | None = None,
        pdf_downloader: Callable[[str], bytes] | None = None,
        pipeline_factory: Callable[[], PaperPipelineService] | None = None,
        pipeline_service: PaperPipelineService | None = None,
        settings_loader: Callable[[Session], object] | None = None,
        storage_service: StorageService | None = None,
    ) -> None:
        self.session = session
        self.adapter_resolver = adapter_resolver or get_adapter
        self.pdf_downloader = pdf_downloader or self._download_pdf_bytes
        self.pipeline_factory = pipeline_factory or PaperPipelineService
        self._pipeline_service = pipeline_service
        self.settings_loader = settings_loader or AutomationSettingsService.get_settings
        self.storage_service = storage_service or StorageService()

    def run_for_date(self, run_date: date, trigger_type: str = "scheduled") -> DailyRun:
        if self.session is not None:
            return self._run_for_date_in_session(run_date, trigger_type)

        with Session(engine) as session:
            self.session = session
            try:
                return self._run_for_date_in_session(run_date, trigger_type)
            finally:
                self.session = None

    def resume_run(self, run_id: int, run_date: date) -> DailyRun:
        """Resume a pre-created DailyRun (status=queued) in a fresh session.

        Used by the async API: the API handler creates the DailyRun immediately
        and returns it, then a background thread calls this method to do the work.
        """
        with Session(engine) as session:
            self.session = session
            try:
                return self._resume_run_in_session(run_id, run_date)
            finally:
                self.session = None

    def _resume_run_in_session(self, run_id: int, run_date: date) -> DailyRun:
        """Resume a pre-created DailyRun record: transition to running and execute the pipeline."""
        if self.session is None:
            raise RuntimeError("DailyIngestionService requires an active database session.")

        run = self.session.get(DailyRun, run_id)
        if run is None:
            raise ValueError(f"DailyRun {run_id} not found")

        settings = self.settings_loader(self.session)
        stats = dict(INITIAL_STATS)

        run.status = "running"
        run.started_at = _utcnow()
        run.stats_json = json.dumps(stats, ensure_ascii=False, sort_keys=True)
        run.updated_at = _utcnow()
        self._save(run, refresh=True)

        return self._execute_pipeline(run, settings, stats)

    def _run_for_date_in_session(self, run_date: date, trigger_type: str) -> DailyRun:
        if self.session is None:
            raise RuntimeError("DailyIngestionService requires an active database session.")

        settings = self.settings_loader(self.session)
        stats = dict(INITIAL_STATS)
        run = DailyRun(
            run_date=run_date,
            scheduled_for=self._compute_scheduled_for(run_date, settings.schedule_time, settings.timezone),
            started_at=_utcnow(),
            status="running",
            trigger_type=trigger_type,
            stats_json=json.dumps(stats, ensure_ascii=False, sort_keys=True),
        )
        self._save(run, refresh=True)

        return self._execute_pipeline(run, settings, stats)

    def _update_progress(self, run: DailyRun, progress: int, message: str) -> None:
        run.progress = max(0, min(100, progress))
        run.progress_message = message
        run.updated_at = _utcnow()
        self._save(run, refresh=True)

    def _execute_pipeline(self, run: DailyRun, settings: object, stats: dict[str, int]) -> DailyRun:
        """Shared pipeline: fetch subscriptions, process candidates, generate briefing."""
        try:
            self._update_progress(run, 5, "正在加载订阅列表...")
            subscriptions = list(
                self.session.exec(
                    select(Subscription).where(Subscription.is_active == True).order_by(Subscription.id.asc())  # noqa: E712
                ).all()
            )
            stats["subscriptions_total"] = len(subscriptions)

            self._update_progress(run, 10, f"开始处理 {len(subscriptions)} 个订阅源...")
            total_subs = max(len(subscriptions), 1)
            for sub_idx, subscription in enumerate(subscriptions):
                # 每轮循环前重新检查订阅状态，允许用户在运行中暂停并立即生效
                # expire() 强制从 DB 重读，避免 session identity map 缓存了旧的 is_active
                self.session.expire(subscription)
                fresh_sub = self.session.get(Subscription, subscription.id)
                if fresh_sub is None or not fresh_sub.is_active:
                    self._update_progress(
                        run,
                        10 + int(((sub_idx + 1) / total_subs) * 70),
                        f"({sub_idx + 1}/{total_subs}) {subscription.name} 已暂停，跳过",
                    )
                    stats["skipped_paused"] = stats.get("skipped_paused", 0) + 1
                    continue
                subscription = fresh_sub
                slice_start = 10 + int((sub_idx / total_subs) * 70)
                slice_end = 10 + int(((sub_idx + 1) / total_subs) * 70)
                self._process_subscription(
                    run.id,
                    subscription,
                    stats,
                    progress_run=run,
                    sub_idx=sub_idx,
                    total_subs=total_subs,
                    slice_start=slice_start,
                    slice_end=slice_end,
                )

            self._update_progress(run, 80, "订阅处理完成，正在统计...")

            if settings.briefing_enabled:
                self._update_progress(run, 85, "正在生成每日速览...")
                DailyBriefingService().generate_for_run(
                    self.session,
                    run,
                    top_n=settings.top_n,
                    project_sidebar_enabled=settings.project_sidebar_enabled,
                    source_count_override=len(subscriptions),
                )

            self._update_progress(run, 95, "即将完成...")
            status, error_message = "completed", None
        except Exception as exc:
            logger.exception("Daily ingestion failed for %s", run.run_date)
            self.session.rollback()
            run = self.session.get(DailyRun, run.id) or run
            status, error_message = "failed", str(exc)
        run.status = status
        run.progress = 100 if status == "completed" else run.progress
        run.progress_message = "全部完成" if status == "completed" else f"失败: {error_message or '未知错误'}"
        run.completed_at = _utcnow()
        run.error_message = error_message
        run.stats_json = json.dumps(stats, ensure_ascii=False, sort_keys=True)
        run.updated_at = _utcnow()
        self._save(run, refresh=True)
        return run

    def _process_subscription(
        self,
        run_id: int,
        subscription: Subscription,
        stats: dict[str, int],
        *,
        progress_run: DailyRun | None = None,
        sub_idx: int = 0,
        total_subs: int = 1,
        slice_start: int = 0,
        slice_end: int = 0,
    ) -> None:
        checked_at = _utcnow()
        if progress_run is not None:
            self._update_progress(
                progress_run,
                slice_start,
                f"({sub_idx + 1}/{total_subs}) 正在抓取「{subscription.name}」候选列表...",
            )
        try:
            source_kind = subscription.source_kind or subscription.type
            adapter = self.adapter_resolver(source_kind)
            candidates = list(adapter.fetch_candidates(subscription))
            subscription.last_success_at = checked_at
            subscription.last_error = None
            if not candidates:
                _record_subscription_issue(
                    stats,
                    subscription,
                    severity="warning",
                    message="该订阅源本次没有返回任何候选条目，请检查关键词、RSS 地址或源站是否有更新。",
                )
        except Exception as exc:
            logger.exception("Subscription fetch failed for subscription %s", subscription.id)
            subscription.last_error = _format_fetch_error_message(exc)
            _record_subscription_issue(
                stats,
                subscription,
                severity="error",
                message=subscription.last_error,
            )
            candidates = []
        subscription.last_checked_at = checked_at
        self._save(subscription)
        if progress_run is not None and "subscription_issues" in stats:
            progress_run.stats_json = json.dumps(stats, ensure_ascii=False, sort_keys=True)
            self._save(progress_run, refresh=True)

        total_cands = max(len(candidates), 1)
        span = max(slice_end - slice_start, 0)
        for cand_idx, candidate in enumerate(candidates):
            stats["candidates_total"] += 1
            title_preview = (candidate.title or candidate.external_id or "").strip()
            if len(title_preview) > 40:
                title_preview = title_preview[:40] + "..."

            def emit(step_label: str, *, cand_i: int = cand_idx, title: str = title_preview) -> None:
                if progress_run is None or span == 0:
                    return
                cand_pct = slice_start + int(((cand_i + 1) / total_cands) * span)
                self._update_progress(
                    progress_run,
                    cand_pct,
                    f"({sub_idx + 1}/{total_subs}) {subscription.name} ({cand_i + 1}/{len(candidates)}) {step_label}：{title}",
                )

            self._process_candidate(run_id, subscription.id, candidate, stats, progress_emit=emit)

    def _process_candidate(
        self,
        run_id: int,
        subscription_id: int,
        candidate: SourceCandidate,
        stats: dict[str, int],
        *,
        progress_emit: Callable[[str], None] | None = None,
    ) -> None:
        def _emit(label: str) -> None:
            if progress_emit is not None:
                progress_emit(label)

        item = self._create_ingestion_item(run_id, subscription_id, candidate)
        if candidate.artifact_type == "project":
            stats["projects_found"] += 1
            _emit("收录项目")
            self._write_item_status(item, "processed")
            return
        existing = self._find_existing_paper(candidate)
        if existing is not None:
            stats["deduplicated"] += 1
            item.paper_id = existing.id
            _emit("已存在，跳过")
            self._write_item_status(item, "deduplicated")
            return
        if not candidate.pdf_url:
            stats["failed_items"] += 1
            self._write_item_status(item, "failed", "No pdf_url available for candidate.")
            return
        paper: Paper | None = None
        try:
            _emit("下载 PDF")
            paper = self._create_paper_from_candidate(candidate)
            stats["papers_imported"] += 1
            item.paper_id = paper.id
            self._write_item_status(item, "pending")
            _emit("MinerU 解析中")
            self._pipeline().parse_paper(self.session, paper)
            _emit("生成摘要 + 自动分类")
            self._pipeline().summarize_paper(self.session, paper, model="gpt-5.4")
            stats["processed_papers"] += 1
            _emit("完成")
            self._write_item_status(item, "processed")
        except Exception as exc:
            logger.exception("Candidate processing failed for '%s'", candidate.title)
            stats["failed_items"] += 1
            if paper is not None:
                item.paper_id = paper.id
            _emit(f"失败: {str(exc)[:50]}")
            self._write_item_status(item, "failed", str(exc))

    def _compute_scheduled_for(self, run_date: date, schedule_time: str, timezone_name: str) -> datetime:
        hour_text, minute_text = schedule_time.split(":", maxsplit=1)
        local_dt = datetime.combine(
            run_date, time(hour=int(hour_text), minute=int(minute_text), tzinfo=get_timezone(timezone_name))
        )
        return local_dt.astimezone(timezone.utc)

    def _find_existing_paper(self, candidate: SourceCandidate) -> Paper | None:
        if candidate.external_id:
            paper = self.session.exec(
                select(Paper).where(Paper.source == candidate.source_kind, Paper.source_id == candidate.external_id)
            ).first()
            if paper is not None:
                return paper
            paper = self._paper_from_items(source_kind=candidate.source_kind, external_id=candidate.external_id)
            if paper is not None:
                return paper
        if candidate.pdf_url:
            paper = self.session.exec(select(Paper).where(Paper.pdf_url == candidate.pdf_url)).first()
            if paper is not None:
                return paper
            paper = self._paper_from_items(pdf_url=candidate.pdf_url)
            if paper is not None:
                return paper
        if candidate.canonical_url:
            paper = self._paper_from_items(canonical_url=candidate.canonical_url)
            if paper is not None:
                return paper
        if not candidate.title or candidate.published_at is None:
            return None
        normalized_title = _normalize_title(candidate.title)
        for paper in self.session.exec(select(Paper)).all():
            if _normalize_title(paper.title) == normalized_title and _same_datetime(paper.published_at, candidate.published_at):
                return paper
        return self._paper_from_items(title=candidate.title, published_at=candidate.published_at)

    def _paper_from_items(self, **filters: str | datetime) -> Paper | None:
        items = list(self.session.exec(select(IngestionItem).where(IngestionItem.paper_id != None)).all())  # noqa: E711
        for item in reversed(items):
            if filters.get("source_kind") and item.source_kind != filters["source_kind"]:
                continue
            if filters.get("external_id") and item.external_id != filters["external_id"]:
                continue
            if filters.get("pdf_url") and item.pdf_url != filters["pdf_url"]:
                continue
            if filters.get("canonical_url") and item.canonical_url != filters["canonical_url"]:
                continue
            if filters.get("title") and _normalize_title(item.title) != _normalize_title(str(filters["title"])):
                continue
            if filters.get("published_at") and not _same_datetime(item.published_at, filters["published_at"]):  # type: ignore[arg-type]
                continue
            paper = self.session.get(Paper, item.paper_id)
            if paper is not None:
                return paper
        return None

    def _download_pdf_bytes(self, pdf_url: str) -> bytes:
        client = get_http_client(follow_redirects=True, timeout=30.0)
        try:
            response = client.get(pdf_url)
            response.raise_for_status()
            return response.content
        finally:
            client.close()

    def _create_paper_from_candidate(self, candidate: SourceCandidate) -> Paper:
        local_pdf_path = self.storage_service.import_uploaded_pdf(
            _build_storage_filename(candidate), io.BytesIO(self.pdf_downloader(candidate.pdf_url))
        )
        paper = Paper(
            source=candidate.source_kind,
            source_id=candidate.external_id or None,
            title=candidate.title or Path(local_pdf_path).name,
            authors=candidate.authors,
            abstract_raw=candidate.abstract_raw,
            pdf_url=candidate.pdf_url,
            published_at=candidate.published_at,
            local_pdf_path=local_pdf_path,
        )
        initialize_pending_category(self.session, paper, reason=PENDING_REASON)
        self._save(paper, refresh=True)
        return paper

    def _create_ingestion_item(self, run_id: int, subscription_id: int, candidate: SourceCandidate) -> IngestionItem:
        item = IngestionItem(
            daily_run_id=run_id,
            subscription_id=subscription_id,
            source_kind=candidate.source_kind,
            artifact_type=candidate.artifact_type,
            external_id=candidate.external_id,
            canonical_url=candidate.canonical_url,
            pdf_url=candidate.pdf_url,
            title=candidate.title or candidate.external_id or "Untitled",
            authors=candidate.authors,
            abstract_raw=candidate.abstract_raw,
            published_at=candidate.published_at,
            fingerprint=candidate.fingerprint(),
            metadata_json=json.dumps(candidate.metadata or {}, ensure_ascii=False),
        )
        self._save(item, refresh=True)
        return item

    def _write_item_status(self, item: IngestionItem, status: str, error_message: str | None = None) -> None:
        item.status = status
        item.error_message = error_message
        item.updated_at = _utcnow()
        self._save(item, refresh=True)

    def _save(self, model: object, *, refresh: bool = False) -> None:
        self.session.add(model)
        self.session.commit()
        if refresh:
            self.session.refresh(model)

    def _pipeline(self) -> PaperPipelineService:
        if self._pipeline_service is None:
            self._pipeline_service = self.pipeline_factory()
        return self._pipeline_service
