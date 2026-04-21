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
        try:
            subscriptions = list(
                self.session.exec(
                    select(Subscription).where(Subscription.is_active == True).order_by(Subscription.id.asc())  # noqa: E712
                ).all()
            )
            stats["subscriptions_total"] = len(subscriptions)
            for subscription in subscriptions:
                self._process_subscription(run.id, subscription, stats)
            if settings.briefing_enabled:
                DailyBriefingService().generate_for_run(
                    self.session,
                    run,
                    top_n=settings.top_n,
                    project_sidebar_enabled=settings.project_sidebar_enabled,
                )
            status, error_message = "completed", None
        except Exception as exc:
            logger.exception("Daily ingestion failed for %s", run_date)
            self.session.rollback()
            run = self.session.get(DailyRun, run.id) or run
            status, error_message = "failed", str(exc)
        run.status = status
        run.completed_at = _utcnow()
        run.error_message = error_message
        run.stats_json = json.dumps(stats, ensure_ascii=False, sort_keys=True)
        run.updated_at = _utcnow()
        self._save(run, refresh=True)
        return run

    def _process_subscription(self, run_id: int, subscription: Subscription, stats: dict[str, int]) -> None:
        checked_at = _utcnow()
        try:
            source_kind = subscription.source_kind or subscription.type
            adapter = self.adapter_resolver(source_kind)
            candidates = list(adapter.fetch_candidates(subscription))
            subscription.last_success_at = checked_at
            subscription.last_error = None
        except Exception as exc:
            logger.exception("Subscription fetch failed for subscription %s", subscription.id)
            subscription.last_error = str(exc)
            candidates = []
        subscription.last_checked_at = checked_at
        self._save(subscription)
        for candidate in candidates:
            stats["candidates_total"] += 1
            self._process_candidate(run_id, subscription.id, candidate, stats)

    def _process_candidate(
        self,
        run_id: int,
        subscription_id: int,
        candidate: SourceCandidate,
        stats: dict[str, int],
    ) -> None:
        item = self._create_ingestion_item(run_id, subscription_id, candidate)
        if candidate.artifact_type == "project":
            stats["projects_found"] += 1
            self._write_item_status(item, "processed")
            return
        existing = self._find_existing_paper(candidate)
        if existing is not None:
            stats["deduplicated"] += 1
            item.paper_id = existing.id
            self._write_item_status(item, "deduplicated")
            return
        if not candidate.pdf_url:
            stats["failed_items"] += 1
            self._write_item_status(item, "failed", "No pdf_url available for candidate.")
            return
        paper: Paper | None = None
        try:
            paper = self._create_paper_from_candidate(candidate)
            stats["papers_imported"] += 1
            item.paper_id = paper.id
            self._write_item_status(item, "pending")
            self._pipeline().parse_paper(self.session, paper)
            self._pipeline().summarize_paper(self.session, paper, model="gpt-5.4-mini")
            stats["processed_papers"] += 1
            self._write_item_status(item, "processed")
        except Exception as exc:
            logger.exception("Candidate processing failed for '%s'", candidate.title)
            stats["failed_items"] += 1
            if paper is not None:
                item.paper_id = paper.id
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
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            response = client.get(pdf_url)
            response.raise_for_status()
            return response.content

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
