from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperStatus:
    QUEUED = "queued"
    PARSING = "parsing"
    PARSED = "parsed"
    SUMMARIZING = "summarizing"
    READY = "ready"
    PARSE_FAILED = "parse_failed"
    SUMMARIZE_FAILED = "summarize_failed"


class PipelineStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class CategoryStatus:
    PENDING_REVIEW = "pending_review"
    AUTO_CONFIRMED = "auto_confirmed"
    MANUAL_LOCKED = "manual_locked"


class Paper(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source: str
    source_id: Optional[str] = None
    title: str
    authors: str = ""
    abstract_raw: str = ""
    pdf_url: str = ""
    local_pdf_path: str
    representative_image_path: str = ""
    published_at: Optional[datetime] = None
    year: Optional[int] = None
    venue: str = ""
    venue_resolution_status: str = "pending"
    venue_resolution_note: str = ""
    doi: str = ""
    url: str = ""
    ccf_rank: str = ""
    sci_zone: str = ""
    impact_factor: str = ""
    ccf_rank_override: str = ""
    sci_zone_override: str = ""
    impact_factor_override: str = ""
    favorite: bool = False
    reading_status: str = "unread"
    reading_progress: int = 0
    user_notes: str = ""
    status: str = PaperStatus.QUEUED
    parse_status: str = PipelineStatus.PENDING
    summary_status: str = PipelineStatus.PENDING
    embedding_status: str = PipelineStatus.PENDING
    primary_category_id: Optional[int] = Field(default=None, foreign_key="category.id", index=True)
    category_confidence: float = 0.0
    category_status: str = CategoryStatus.PENDING_REVIEW
    category_reason: str = ""
    tags_json: str = "[]"
    ready_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def tags(self) -> list[str]:
        import json
        try:
            return json.loads(self.tags_json)
        except (json.JSONDecodeError, TypeError):
            return []

    @tags.setter
    def tags(self, val: list[str]):
        import json
        self.tags_json = json.dumps(val, ensure_ascii=False)
