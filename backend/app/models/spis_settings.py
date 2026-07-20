from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SpisSettings(SQLModel, table=True):
    __tablename__ = "spis_settings"

    id: int | None = Field(default=1, primary_key=True)
    account: str = ""
    password: str = ""
    enabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
