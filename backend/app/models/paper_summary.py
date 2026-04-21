from typing import Optional

from sqlmodel import Field, SQLModel


class PaperSummary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, unique=True, foreign_key="paper.id")
    one_line_summary: str = ""
    core_contributions: str = ""
    method_summary: str = ""
    use_cases: str = ""
    limitations: str = ""
    relevance_note: str = ""
    model_name: str = "deepseek-chat"
    prompt_version: str = "v1"
