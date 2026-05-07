from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperBlockType:
    TEXT = "text"
    TITLE = "title"
    TABLE = "table"
    IMAGE = "image"
    CHART = "chart"
    FORMULA = "formula"
    LIST = "list"
    CODE = "code"
    UNKNOWN = "unknown"


class PaperBlock(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, foreign_key="paper.id")
    page_index: Optional[int] = Field(default=None, index=True)
    block_index: int = Field(default=0, index=True)
    block_type: str = Field(default=PaperBlockType.UNKNOWN, index=True)
    text: str = ""
    bbox_json: str = ""
    source_hash: str = Field(index=True)
    source_json: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
