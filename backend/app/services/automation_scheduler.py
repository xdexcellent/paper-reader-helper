from __future__ import annotations

import logging
import threading
from datetime import date, datetime, time, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.core.db import engine
from app.core.timezone import get_timezone
from app.models.automation_settings import AutomationSettings
from app.models.daily_run import DailyRun
from app.services.automation_settings_service import AutomationSettingsService
from app.services.daily_ingestion import DailyIngestionService

logger = logging.getLogger(__name__)


class AutomationScheduler:
    def __init__(
        self,
        *,
        check_interval_seconds: float = 60.0,
        clock: Callable[[], datetime] | None = None,
        ingestion_service_factory: Callable[[], DailyIngestionService] | None = None,
    ) -> None:
        self.check_interval_seconds = check_interval_seconds
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.ingestion_service_factory = ingestion_service_factory or DailyIngestionService
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_run_date: date | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="automation-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    def load_settings(self, session: Session | None = None) -> AutomationSettings:
        if session is not None:
            return self._read_settings(session)
        with Session(engine) as managed_session:
            return self._read_settings(managed_session)

    def tick(self, session: Session | None = None):
        if session is not None:
            return self._tick_in_session(session)
        with Session(engine) as managed_session:
            return self._tick_in_session(managed_session)

    def _run_loop(self) -> None:
        while not self._stop_event.wait(self.check_interval_seconds):
            try:
                self.tick()
            except Exception:
                logger.exception("Automation scheduler tick failed")

    def _tick_in_session(self, session: Session):
        settings = self._read_settings(session)
        if not settings.enabled or not settings.briefing_enabled:
            return None

        local_now = self._local_now(settings.timezone)
        if local_now.time() < self._parse_schedule_time(settings.schedule_time):
            return None
        if self._last_run_date == local_now.date():
            return None

        existing_run = session.exec(
            select(DailyRun)
            .where(
                DailyRun.run_date == local_now.date(),
                DailyRun.trigger_type == "scheduled",
            )
            .order_by(DailyRun.created_at.desc())
        ).first()
        if existing_run is not None:
            self._last_run_date = local_now.date()
            return None

        run = self.ingestion_service_factory().run_for_date(local_now.date(), trigger_type="scheduled")
        self._last_run_date = local_now.date()
        return run

    def _read_settings(self, session: Session) -> AutomationSettings:
        settings = session.get(AutomationSettings, AutomationSettingsService.SINGLETON_ID)
        if settings is not None:
            return settings
        return AutomationSettings(id=AutomationSettingsService.SINGLETON_ID)

    def _local_now(self, timezone_name: str) -> datetime:
        target_timezone = get_timezone(timezone_name)
        now = self.clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return now.astimezone(target_timezone)

    def _parse_schedule_time(self, value: str) -> time:
        hour_text, minute_text = value.split(":", maxsplit=1)
        return time(hour=int(hour_text), minute=int(minute_text))
