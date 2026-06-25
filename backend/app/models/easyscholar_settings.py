from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EasyScholarSettings(SQLModel, table=True):
    __tablename__ = "easyscholar_settings"

    id: int | None = Field(default=1, primary_key=True)
    api_key: str = ""
    enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
