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
from app.services.venue_rank_service import apply_system_rank

logger = logging.getLogger(__name__)
PENDING_REASON = "Waiting for summary and automatic classification."
PDF_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
}
INITIAL_STATS = {
    "subscriptions_total": 0,
    "candidates_total": 0,
    "projects_found": 0,
    "papers_imported": 0,
    "deduplicated": 0,
    "failed_items": 0,
    # Candidates from metadata-only sources (DBLP / Crossref / many RSS feeds) that
    # never expose a downloadable PDF URL. They are *not* ingestion failures, so
    # they are tracked separately and excluded from the "论文处理失败" risk panel.
    "skipped_no_pdf_url": 0,
    "skipped_restricted_pdf": 0,
    "processed_papers": 0,
}


class RestrictedPdfError(RuntimeError):
    """Raised when the source advertises a PDF URL but blocks direct download."""


def _is_restricted_pdf_exception(exc: Exception) -> bool:
    if isinstance(exc, RestrictedPdfError):
        return True
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
        return exc.response.status_code in {401, 403, 451}
    lower = str(exc).lower()
    return (
        "403 forbidden" in lower
        or "401 unauthorized" in lower
        or "451 unavailable" in lower
        or "http 403" in lower
        or "http 401" in lower
        or "http 451" in lower
        or "限制直接下载 pdf" in lower
    )


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


def _filter_candidates_with_pdf(
    raw_candidates: list,
    fetch_limit: int,
) -> list:
    """硬过滤：论文类候选必须有 pdf_url，否则直接丢弃不参与后续处理。

    DBLP / Crossref / 部分 RSS 源只提供元数据，没有可下载 PDF 链接；之前会建立
    IngestionItem 并进入处理流程再失败，污染"论文处理失败"面板。这里在入口处就
    把它们过滤掉，不计入 candidates_total、不建 IngestionItem，也不做去重匹配。

    项目类候选 (artifact_type == "project") 不依赖 pdf_url，原样保留。
    """
    projects: list = []
    papers_with_pdf: list = []

    for candidate in raw_candidates:
        if candidate.artifact_type == "project":
            projects.append(candidate)
        elif candidate.pdf_url:
            papers_with_pdf.append(candidate)
        # 无 pdf_url 的论文候选：丢弃

    # 项目不受 fetch_limit 限制（通常很少）；论文按 fetch_limit 截断
    paper_slots = max(fetch_limit - len(projects), 0)
    return projects[:fetch_limit] + papers_with_pdf[:paper_slots]


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
                try:
                    DailyBriefingService().generate_for_run(
                        self.session,
                        run,
                        top_n=settings.top_n,
                        project_sidebar_enabled=settings.project_sidebar_enabled,
                        source_count_override=len(subscriptions),
                        research_direction=getattr(settings, "research_direction", "") or "",
                        research_keywords=getattr(settings, "research_keywords", "") or "",
                    )
                except Exception as exc:
                    # 日报生成失败不应阻断整个 run；日志记录 + 继续完成流程
                    logger.exception("Daily briefing generation failed for run %s", run.id)
                    self.session.rollback()
                    stats["briefing_error"] = str(exc)[:200]
                    _record_subscription_issue(
                        stats,
                        Subscription(id=0, name="每日速览生成", source_kind="briefing"),
                        severity="error",
                        message=f"日报生成失败：{str(exc)[:200]}",
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
            # 预处理：适度超量拉取（1.5倍）以便过滤无 PDF 的条目，避免触发 API 限流
            original_limit = subscription.fetch_limit
            subscription.fetch_limit = max(int(original_limit * 1.5), original_limit + 2)
            try:
                raw_candidates = list(adapter.fetch_candidates(subscription))
            finally:
                subscription.fetch_limit = original_limit
            subscription.last_success_at = checked_at
            subscription.last_error = None
            if not raw_candidates:
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
            raw_candidates = []
        subscription.last_checked_at = checked_at
        self._save(subscription)
        if progress_run is not None and "subscription_issues" in stats:
            progress_run.stats_json = json.dumps(stats, ensure_ascii=False, sort_keys=True)
            self._save(progress_run, refresh=True)

        # 预处理过滤：论文必须有 pdf_url，否则直接 drop 不进入后续流程
        candidates = _filter_candidates_with_pdf(raw_candidates, subscription.fetch_limit)
        dropped_no_pdf = len(raw_candidates) - len(candidates)
        if dropped_no_pdf > 0:
            # 仍保留一个 stats 计数便于观察过滤比例，但不再体现在 IngestionItem 上
            stats["skipped_no_pdf_url"] = stats.get("skipped_no_pdf_url", 0) + dropped_no_pdf
            logger.info(
                "Subscription '%s': dropped %d candidate(s) without pdf_url, kept %d",
                subscription.name,
                dropped_no_pdf,
                len(candidates),
            )

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
            # Try Unpaywall as fallback if we have a DOI
            doi = (candidate.metadata or {}).get("doi", "")
            if doi:
                _emit("尝试 Unpaywall 查找 PDF")
                pdf_from_unpaywall = self._try_unpaywall_pdf(doi)
                if pdf_from_unpaywall:
                    candidate.pdf_url = pdf_from_unpaywall
                    logger.info("Unpaywall found PDF for DOI %s: %s", doi, pdf_from_unpaywall)

        if not candidate.pdf_url:
            # Metadata-only sources (DBLP / Crossref / many RSS feeds) routinely
            # deliver candidates without a downloadable PDF URL. Treating each of
            # those as a pipeline failure floods the 风险点 panel with noise and
            # hides genuine download/parse errors, so we classify them as skipped
            # instead. The candidate is still persisted for briefing visibility.
            stats["skipped_no_pdf_url"] += 1
            _emit("源站未提供 PDF，跳过")
            self._write_item_status(item, "skipped_no_pdf", "No pdf_url available for candidate.")
            return
        paper: Paper | None = None
        try:
            _emit("下载 PDF")

            def skip_restricted_pdf(exc: Exception) -> None:
                stats["skipped_restricted_pdf"] = stats.get("skipped_restricted_pdf", 0) + 1
                _emit("源站限制 PDF，跳过解析")
                self._write_item_status(item, "skipped_restricted_pdf", str(exc))

            try:
                paper = self._create_paper_from_candidate(candidate)
            except RestrictedPdfError as restricted_exc:
                skip_restricted_pdf(restricted_exc)
                return
            except Exception as download_exc:
                # PDF download failed — try Unpaywall as fallback
                doi = (candidate.metadata or {}).get("doi", "")
                original_restricted = _is_restricted_pdf_exception(download_exc)
                if doi:
                    _emit("PDF 下载失败，尝试 Unpaywall")
                    alt_pdf = self._try_unpaywall_pdf(doi)
                    if alt_pdf and alt_pdf != candidate.pdf_url:
                        candidate.pdf_url = alt_pdf
                        try:
                            paper = self._create_paper_from_candidate(candidate)
                        except Exception as alt_download_exc:
                            if _is_restricted_pdf_exception(alt_download_exc):
                                skip_restricted_pdf(alt_download_exc)
                                return
                            raise alt_download_exc
                    elif original_restricted:
                        skip_restricted_pdf(download_exc)
                        return
                    else:
                        raise download_exc
                elif original_restricted:
                    skip_restricted_pdf(download_exc)
                    return
                else:
                    raise download_exc

            stats["papers_imported"] += 1
            item.paper_id = paper.id
            self._write_item_status(item, "pending")
            _emit("MinerU 解析中")
            self._pipeline().parse_paper(self.session, paper)
            _emit("生成摘要 + 自动分类")
            self._pipeline().summarize_paper(self.session, paper)
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

    def _try_unpaywall_pdf(self, doi: str) -> str:
        """Try to find a PDF URL via Unpaywall for the given DOI."""
        import os
        email = os.environ.get("UNPAYWALL_EMAIL") or os.environ.get("OPENALEX_EMAIL") or "user@example.com"
        try:
            client = get_http_client(follow_redirects=True, timeout=15.0)
            response = client.get(f"https://api.unpaywall.org/v2/{doi}", params={"email": email})
            response.raise_for_status()
            data = response.json()
            client.close()
            best_oa = data.get("best_oa_location") or {}
            return best_oa.get("url_for_pdf") or best_oa.get("url") or ""
        except Exception as exc:
            logger.debug("Unpaywall lookup failed for %s: %s", doi, exc)
            return ""

    def _download_pdf_bytes(self, pdf_url: str) -> bytes:
        # Skip known paywalled domains
        _BLOCKED = ('dl.acm.org', 'ieeexplore.ieee.org', 'onlinelibrary.wiley.com',
                    'www.sciencedirect.com', 'journals.sagepub.com', 'www.tandfonline.com')
        if any(domain in pdf_url for domain in _BLOCKED):
            raise RestrictedPdfError(f"源站限制直接下载 PDF：{pdf_url}")

        client = get_http_client(follow_redirects=True, timeout=30.0)
        try:
            response = client.get(pdf_url, headers=PDF_DOWNLOAD_HEADERS)
            if response.status_code in {401, 403, 451}:
                raise RestrictedPdfError(
                    f"源站返回 HTTP {response.status_code}，限制直接下载 PDF：{pdf_url}"
                )
            response.raise_for_status()
            return response.content
        finally:
            client.close()

    def _create_paper_from_candidate(self, candidate: SourceCandidate) -> Paper:
        local_pdf_path = self.storage_service.import_uploaded_pdf(
            _build_storage_filename(candidate), io.BytesIO(self.pdf_downloader(candidate.pdf_url))
        )
        metadata = candidate.metadata or {}
        venue = (
            metadata.get("venue")
            or metadata.get("journal")
            or metadata.get("publication_title")
            or ""
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
            venue=venue,
        )
        apply_system_rank(paper)
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
