from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class IngestionItem(SQLModel, table=True):
    __tablename__ = "ingestion_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    daily_run_id: int = Field(foreign_key="daily_run.id", index=True)
    subscription_id: Optional[int] = Field(default=None, foreign_key="subscription.id", index=True)
    source_kind: str = "arxiv"
    artifact_type: str = "paper"
    external_id: str = Field(default="", index=True)
    canonical_url: str = ""
    pdf_url: str = ""
    title: str
    authors: str = ""
    abstract_raw: str = ""
    published_at: Optional[datetime] = None
    discovered_at: datetime = Field(default_factory=_utcnow)
    fingerprint: str = Field(default="", index=True)
    status: str = "pending"
    paper_id: Optional[int] = Field(default=None, foreign_key="paper.id", index=True)
    error_message: Optional[str] = None
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
