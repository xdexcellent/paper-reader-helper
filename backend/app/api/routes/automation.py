import json
import logging
import threading
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.db import engine, get_session
from app.core.timezone import get_local_today, get_timezone
from app.models.automation_settings import AutomationSettings
from app.models.daily_briefing import DailyBriefing
from app.models.daily_run import DailyRun
from app.schemas.automation import (
    AutomationRunResponse,
    AutomationRunStatus,
    AutomationSettingsResponse,
    AutomationSubscriptionIssue,
    AutomationSettingsUpdate,
    AutomationTodayStatusResponse,
)
from app.services.automation_settings_service import AutomationSettingsService
from app.services.daily_briefing_service import DailyBriefingService
from app.services.daily_ingestion import DailyIngestionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/automation", tags=["automation"])


def _today_for_settings(db: Session) -> date:
    settings = db.get(AutomationSettings, AutomationSettingsService.SINGLETON_ID)
    timezone_name = settings.timezone if settings is not None else "Asia/Shanghai"
    return get_local_today(timezone_name).date()


def _compute_scheduled_for(run_date: date, schedule_time: str, timezone_name: str) -> datetime:
    hour_text, minute_text = schedule_time.split(":", maxsplit=1)
    local_dt = datetime.combine(
        run_date, time(hour=int(hour_text), minute=int(minute_text), tzinfo=get_timezone(timezone_name))
    )
    return local_dt.astimezone(timezone.utc)


def _run_ingestion_background(run_id: int, run_date: date) -> None:
    """Execute the full ingestion pipeline in a background thread."""
    try:
        DailyIngestionService().resume_run(run_id, run_date)
    except Exception:
        logger.exception("Background ingestion failed for run %s", run_id)


def _subscription_issues_for_run(run: DailyRun) -> list[AutomationSubscriptionIssue]:
    try:
        stats = json.loads(run.stats_json or "{}")
    except json.JSONDecodeError:
        return []
    issues = stats.get("subscription_issues") or []
    if not isinstance(issues, list):
        return []
    return [
        AutomationSubscriptionIssue.model_validate(issue)
        for issue in issues
        if isinstance(issue, dict)
    ]


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
    today = _today_for_settings(db)
    settings = AutomationSettingsService.get_settings(db)
    run = DailyRun(
        run_date=today,
        scheduled_for=_compute_scheduled_for(today, settings.schedule_time, settings.timezone),
        started_at=None,
        status="queued",
        trigger_type="manual",
        stats_json=json.dumps({}, ensure_ascii=False),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Resolve at call-time so monkeypatch can intercept in tests
    bg_fn = globals()["_run_ingestion_background"]
    thread = threading.Thread(
        target=bg_fn,
        args=(run.id, today),
        daemon=True,
        name=f"ingestion-run-{run.id}",
    )
    thread.start()

    return AutomationRunResponse(run_id=run.id, status=run.status)


@router.post("/cancel", status_code=200)
def cancel_running_run(
    db: Session = Depends(get_session),
) -> dict:
    today = _today_for_settings(db)
    running = db.exec(
        select(DailyRun)
        .where(DailyRun.run_date == today, DailyRun.status == "running")
        .order_by(DailyRun.created_at.desc())
        .limit(1)
    ).first()
    if running is None:
        queued = db.exec(
            select(DailyRun)
            .where(DailyRun.run_date == today, DailyRun.status == "queued")
            .order_by(DailyRun.created_at.desc())
            .limit(1)
        ).first()
        if queued is None:
            return {"ok": False, "message": "没有正在运行的任务"}
        db.delete(queued)
        db.commit()
        return {"ok": True, "message": "已取消排队中的任务"}
    running.status = "cancelled"
    running.progress_message = "用户取消"
    db.add(running)
    db.commit()
    return {"ok": True, "message": "已取消运行中的任务"}


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
                progress=today_run.progress,
                progress_message=today_run.progress_message,
                subscription_issues=_subscription_issues_for_run(today_run),
            )
            if today_run is not None
            else None
        ),
        today_briefing_exists=today_briefing is not None,
        fallback_used=fallback_used,
        fallback_briefing_date=(fallback_briefing.briefing_date.isoformat() if fallback_briefing is not None else None),
    )
