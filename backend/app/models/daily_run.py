from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DailyRun(SQLModel, table=True):
    __tablename__ = "daily_run"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_date: date = Field(index=True)
    scheduled_for: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    status: str = "pending"
    trigger_type: str = "scheduled"
    stats_json: str = "{}"
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
