from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperBlockTranslationStatus:
    COMPLETED = "completed"
    FAILED = "failed"


class PaperBlockTranslation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, foreign_key="paper.id")
    block_id: int = Field(index=True, foreign_key="paperblock.id")
    target_language: str = Field(default="zh-CN", index=True)
    model_name: str = Field(default="gpt-5.4", index=True)
    prompt_version: str = Field(default="block-translate-v1", index=True)
    source_hash: str = Field(index=True)
    translated_text: str = ""
    status: str = Field(default=PaperBlockTranslationStatus.COMPLETED, index=True)
    error_message: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
