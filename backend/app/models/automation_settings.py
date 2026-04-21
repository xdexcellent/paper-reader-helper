from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AutomationSettings(SQLModel, table=True):
    __tablename__ = "automation_settings"

    id: int | None = Field(default=1, primary_key=True)
    enabled: bool = True
    schedule_time: str = "12:00"
    timezone: str = "Asia/Shanghai"
    top_n: int = 5
    briefing_enabled: bool = True
    project_sidebar_enabled: bool = True
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
