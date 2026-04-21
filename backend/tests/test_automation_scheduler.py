from datetime import date, datetime, timezone

from sqlmodel import SQLModel, Session, create_engine

from app.models.automation_settings import AutomationSettings
from app.models.daily_briefing import DailyBriefing
from app.models.daily_run import DailyRun
from app.services.automation_scheduler import AutomationScheduler
from app.services.category_service import ensure_default_categories


class _FakeIngestionService:
    def __init__(self) -> None:
        self.calls: list[tuple[date, str]] = []

    def run_for_date(self, run_date: date, trigger_type: str = "scheduled"):
        self.calls.append((run_date, trigger_type))
        return object()


def _make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        ensure_default_categories(session)
    return engine


def test_scheduler_tick_runs_once_when_schedule_is_due() -> None:
    engine = _make_session()
    fake_ingestion = _FakeIngestionService()
    scheduler = AutomationScheduler(
        clock=lambda: datetime(2026, 4, 20, 4, 0, tzinfo=timezone.utc),
        ingestion_service_factory=lambda: fake_ingestion,
    )

    with Session(engine) as session:
        session.add(AutomationSettings(schedule_time="12:00", timezone="Asia/Shanghai"))
        session.commit()

        first = scheduler.tick(session)
        second = scheduler.tick(session)

    assert first is not None
    assert second is None
    assert fake_ingestion.calls == [(date(2026, 4, 20), "scheduled")]


def test_scheduler_tick_skips_when_automation_is_disabled() -> None:
    engine = _make_session()
    fake_ingestion = _FakeIngestionService()
    scheduler = AutomationScheduler(
        clock=lambda: datetime(2026, 4, 20, 4, 0, tzinfo=timezone.utc),
        ingestion_service_factory=lambda: fake_ingestion,
    )

    with Session(engine) as session:
        session.add(AutomationSettings(enabled=False, schedule_time="12:00", timezone="Asia/Shanghai"))
        session.commit()

        result = scheduler.tick(session)

    assert result is None
    assert fake_ingestion.calls == []


def test_scheduler_tick_skips_when_scheduled_run_already_exists_for_local_day() -> None:
    engine = _make_session()
    fake_ingestion = _FakeIngestionService()
    scheduler = AutomationScheduler(
        clock=lambda: datetime(2026, 4, 20, 4, 0, tzinfo=timezone.utc),
        ingestion_service_factory=lambda: fake_ingestion,
    )

    with Session(engine) as session:
        session.add(AutomationSettings(schedule_time="12:00", timezone="Asia/Shanghai"))
        session.add(
            DailyRun(
                run_date=date(2026, 4, 20),
                scheduled_for=datetime(2026, 4, 20, 4, 0, tzinfo=timezone.utc),
                status="completed",
                trigger_type="scheduled",
            )
        )
        session.commit()

        result = scheduler.tick(session)

    assert result is None
    assert fake_ingestion.calls == []
