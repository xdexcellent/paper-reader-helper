from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.core.db import get_session
from app.core.timezone import get_local_today
from app.models.automation_settings import AutomationSettings
from app.schemas.briefing import (
    BriefingFailedItem,
    BriefingPaperItem,
    BriefingProjectItem,
    DailyBriefingHistoryItem,
    DailyBriefingResponse,
)
from app.models.daily_run import DailyRun
from app.services.automation_settings_service import AutomationSettingsService
from app.services.daily_briefing_service import DailyBriefingService

router = APIRouter(prefix="/briefing", tags=["briefing"])


def _today_for_settings(session: Session) -> date:
    settings = session.get(AutomationSettings, AutomationSettingsService.SINGLETON_ID)
    timezone_name = settings.timezone if settings is not None else "Asia/Shanghai"
    return get_local_today(timezone_name).date()


def _to_response(
    service: DailyBriefingService,
    session: Session,
    briefing,
    *,
    fallback_used: bool,
) -> DailyBriefingResponse:
    papers = service.get_paper_items(session, briefing.id)
    projects = service.get_project_items(session, briefing.id)
    failed = service.get_failed_items_for_run(session, briefing.daily_run_id)
    run = session.get(DailyRun, briefing.daily_run_id) if briefing.daily_run_id is not None else None
    return DailyBriefingResponse(
        briefing_date=briefing.briefing_date.isoformat(),
        status=briefing.status,
        generated_at=briefing.generated_at.isoformat(),
        daily_run_id=briefing.daily_run_id,
        trigger_type=run.trigger_type if run is not None else None,
        summary_markdown=briefing.summary_markdown,
        paper_count=briefing.paper_count,
        project_count=briefing.project_count,
        source_count=briefing.source_count,
        fallback_used=fallback_used,
        top_papers=[
            BriefingPaperItem(
                paper_id=item.paper_id,
                rank=item.rank or item.rank_order,
                score=item.score,
                reason=item.reason or item.summary_text,
                source_kind=item.source_kind,
                title=item.title or "",
                summary_text=item.summary_text or "",
                canonical_url=item.canonical_url or "",
                pdf_url=item.pdf_url or "",
            )
            for item in papers
        ],
        projects=[
            BriefingProjectItem(
                rank=item.rank or item.sort_order,
                title=item.title or item.project_name,
                url=item.url,
                summary=item.summary or item.note,
                source_kind=item.source_kind,
            )
            for item in projects
        ],
        failed_items=[
            BriefingFailedItem(
                title=item.title or item.external_id or "未命名候选",
                source_kind=item.source_kind,
                canonical_url=item.canonical_url or "",
                pdf_url=item.pdf_url or "",
                reason=service.friendly_failure_reason(item.error_message),
            )
            for item in failed
        ],
    )


def _to_history_item(session: Session, briefing) -> DailyBriefingHistoryItem:
    run = session.get(DailyRun, briefing.daily_run_id) if briefing.daily_run_id is not None else None
    return DailyBriefingHistoryItem(
        briefing_date=briefing.briefing_date.isoformat(),
        status=briefing.status,
        generated_at=briefing.generated_at.isoformat(),
        daily_run_id=briefing.daily_run_id,
        trigger_type=run.trigger_type if run is not None else None,
        summary_markdown=briefing.summary_markdown,
        paper_count=briefing.paper_count,
        project_count=briefing.project_count,
        source_count=briefing.source_count,
    )


@router.get("/today", response_model=DailyBriefingResponse)
def get_today_briefing(db: Session = Depends(get_session)) -> DailyBriefingResponse:
    service = DailyBriefingService()
    today = _today_for_settings(db)
    briefing = service.get_briefing_by_date(db, today)
    fallback_used = False
    if briefing is None:
        briefing = service.get_latest_successful(db)
        fallback_used = briefing is not None
    if briefing is None:
        raise HTTPException(status_code=404, detail="No daily briefing available.")
    return _to_response(service, db, briefing, fallback_used=fallback_used)


@router.get("/history", response_model=list[DailyBriefingHistoryItem])
def get_briefing_history(
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_session),
) -> list[DailyBriefingHistoryItem]:
    service = DailyBriefingService()
    return [_to_history_item(db, briefing) for briefing in service.get_history(db, days)]


@router.get("/{briefing_date}", response_model=DailyBriefingResponse)
def get_briefing_by_date(
    briefing_date: date,
    db: Session = Depends(get_session),
) -> DailyBriefingResponse:
    service = DailyBriefingService()
    briefing = service.get_briefing_by_date(db, briefing_date)
    if briefing is None:
        raise HTTPException(status_code=404, detail="Daily briefing not found.")
    return _to_response(service, db, briefing, fallback_used=False)
