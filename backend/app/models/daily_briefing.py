from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DailyBriefing(SQLModel, table=True):
    __tablename__ = "daily_briefing"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Keep run_date for compatibility with early daily briefing snapshots.
    run_date: Optional[date] = Field(default=None, index=True)
    briefing_date: date = Field(index=True)
    daily_run_id: Optional[int] = Field(default=None, foreign_key="daily_run.id", index=True)
    status: str = "completed"
    generated_at: datetime = Field(default_factory=_utcnow)
    top_n: int = 5
    summary_markdown: str = ""
    paper_count: int = 0
    project_count: int = 0
    source_count: int = 0
    fallback_used: bool = False
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    def __init__(self, **data):
        if data.get("run_date") is None and data.get("briefing_date") is not None:
            data["run_date"] = data["briefing_date"]
        super().__init__(**data)


class DailyBriefingPaperItem(SQLModel, table=True):
    __tablename__ = "daily_briefing_paper_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    # daily_briefing_id/rank_order are retained for rows created by the early prototype.
    daily_briefing_id: Optional[int] = Field(default=None, foreign_key="daily_briefing.id", index=True)
    briefing_id: Optional[int] = Field(default=None, foreign_key="daily_briefing.id", index=True)
    paper_id: Optional[int] = Field(default=None, foreign_key="paper.id", index=True)
    ingestion_item_id: Optional[int] = Field(default=None, foreign_key="ingestion_item.id", index=True)
    rank_order: int = 0
    rank: int = 0
    score: float = 0.0
    reason: str = ""
    source_kind: str = ""
    title: str = ""
    authors: str = ""
    summary_text: str = ""
    canonical_url: str = ""
    pdf_url: str = ""
    published_at: Optional[datetime] = None
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)

    def __init__(self, **data):
        if data.get("daily_briefing_id") is None and data.get("briefing_id") is not None:
            data["daily_briefing_id"] = data["briefing_id"]
        if data.get("briefing_id") is None and data.get("daily_briefing_id") is not None:
            data["briefing_id"] = data["daily_briefing_id"]
        if not data.get("rank_order") and data.get("rank"):
            data["rank_order"] = data["rank"]
        if not data.get("rank") and data.get("rank_order"):
            data["rank"] = data["rank_order"]
        super().__init__(**data)


class DailyBriefingProjectItem(SQLModel, table=True):
    __tablename__ = "daily_briefing_project_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    daily_briefing_id: Optional[int] = Field(default=None, foreign_key="daily_briefing.id", index=True)
    briefing_id: Optional[int] = Field(default=None, foreign_key="daily_briefing.id", index=True)
    ingestion_item_id: Optional[int] = Field(default=None, foreign_key="ingestion_item.id", index=True)
    rank: int = 0
    title: str = ""
    url: str = ""
    summary: str = ""
    source_kind: str = ""
    project_key: str = Field(index=True)
    project_name: str = ""
    note: str = ""
    sort_order: int = 0
    metadata_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)

    def __init__(self, **data):
        if data.get("daily_briefing_id") is None and data.get("briefing_id") is not None:
            data["daily_briefing_id"] = data["briefing_id"]
        if data.get("briefing_id") is None and data.get("daily_briefing_id") is not None:
            data["briefing_id"] = data["daily_briefing_id"]
        if not data.get("sort_order") and data.get("rank"):
            data["sort_order"] = data["rank"]
        if not data.get("rank") and data.get("sort_order"):
            data["rank"] = data["sort_order"]
        if not data.get("project_name") and data.get("title"):
            data["project_name"] = data["title"]
        if not data.get("title") and data.get("project_name"):
            data["title"] = data["project_name"]
        if not data.get("note") and data.get("summary"):
            data["note"] = data["summary"]
        if not data.get("summary") and data.get("note"):
            data["summary"] = data["note"]
        if not data.get("project_key") and data.get("title"):
            data["project_key"] = data["title"]
        super().__init__(**data)
