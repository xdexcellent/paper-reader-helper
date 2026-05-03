from pydantic import BaseModel, Field


class BriefingPaperItem(BaseModel):
    paper_id: int | None
    rank: int
    score: float
    reason: str
    source_kind: str
    title: str = ""
    summary_text: str = ""
    canonical_url: str = ""
    pdf_url: str = ""


class BriefingProjectItem(BaseModel):
    rank: int
    title: str
    url: str
    summary: str
    source_kind: str


class BriefingFailedItem(BaseModel):
    title: str
    source_kind: str
    canonical_url: str = ""
    pdf_url: str = ""
    reason: str  # human-friendly failure reason


class DailyBriefingResponse(BaseModel):
    briefing_date: str
    status: str
    generated_at: str
    daily_run_id: int | None = None
    trigger_type: str | None = None
    summary_markdown: str
    paper_count: int
    project_count: int
    source_count: int
    fallback_used: bool
    top_papers: list[BriefingPaperItem]
    projects: list[BriefingProjectItem]
    failed_items: list[BriefingFailedItem] = Field(default_factory=list)


class DailyBriefingHistoryItem(BaseModel):
    briefing_date: str
    status: str
    generated_at: str
    daily_run_id: int | None = None
    trigger_type: str | None = None
    summary_markdown: str = Field(default="")
    paper_count: int
    project_count: int
    source_count: int
