from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.timezone import get_local_today
from app.models.automation_settings import AutomationSettings
from app.models.daily_briefing import DailyBriefing
from app.models.daily_run import DailyRun
from app.schemas.automation import (
    AutomationRunResponse,
    AutomationRunStatus,
    AutomationSettingsResponse,
    AutomationSettingsUpdate,
    AutomationTodayStatusResponse,
)
from app.services.automation_settings_service import AutomationSettingsService
from app.services.daily_briefing_service import DailyBriefingService
from app.services.daily_ingestion import DailyIngestionService

router = APIRouter(prefix="/automation", tags=["automation"])


def _today_for_settings(db: Session) -> date:
    settings = db.get(AutomationSettings, AutomationSettingsService.SINGLETON_ID)
    timezone_name = settings.timezone if settings is not None else "Asia/Shanghai"
    return get_local_today(timezone_name).date()


@router.get("/settings", response_model=AutomationSettingsResponse)
def get_automation_settings(
    db: Session = Depends(get_session),
) -> AutomationSettingsResponse:
    settings = AutomationSettingsService.get_settings(db)
    return AutomationSettingsResponse.model_validate(settings)


@router.put("/settings", response_model=AutomationSettingsResponse)
def update_automation_settings(
    payload: AutomationSettingsUpdate,
    db: Session = Depends(get_session),
) -> AutomationSettingsResponse:
    settings = AutomationSettingsService.update_settings(
        db,
        payload.model_dump(exclude_unset=True),
    )
    return AutomationSettingsResponse.model_validate(settings)


@router.post("/runs/today", response_model=AutomationRunResponse, status_code=202)
def run_today_briefing(
    db: Session = Depends(get_session),
) -> AutomationRunResponse:
    run = DailyIngestionService().run_for_date(_today_for_settings(db), trigger_type="manual")
    return AutomationRunResponse(run_id=run.id, status=run.status)


@router.get("/status/today", response_model=AutomationTodayStatusResponse)
def get_today_automation_status(
    db: Session = Depends(get_session),
) -> AutomationTodayStatusResponse:
    settings = AutomationSettingsService.get_settings(db)
    local_today = _today_for_settings(db)
    today_run = db.exec(
        select(DailyRun)
        .where(DailyRun.run_date == local_today)
        .order_by(DailyRun.created_at.desc())
    ).first()

    briefing_service = DailyBriefingService()
    today_briefing = briefing_service.get_briefing_by_date(db, local_today)
    fallback_briefing = None
    fallback_used = False
    if today_briefing is None:
        fallback_briefing = briefing_service.get_latest_successful(db)
        fallback_used = fallback_briefing is not None

    return AutomationTodayStatusResponse(
        local_today=local_today.isoformat(),
        enabled=settings.enabled,
        briefing_enabled=settings.briefing_enabled,
        schedule_time=settings.schedule_time,
        timezone=settings.timezone,
        today_run=(
            AutomationRunStatus(
                id=today_run.id,
                status=today_run.status,
                trigger_type=today_run.trigger_type,
                started_at=today_run.started_at.isoformat() if today_run.started_at else None,
                completed_at=today_run.completed_at.isoformat() if today_run.completed_at else None,
                error_message=today_run.error_message,
            )
            if today_run is not None
            else None
        ),
        today_briefing_exists=today_briefing is not None,
        fallback_used=fallback_used,
        fallback_briefing_date=(fallback_briefing.briefing_date.isoformat() if fallback_briefing is not None else None),
    )
