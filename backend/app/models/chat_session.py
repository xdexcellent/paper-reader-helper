from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = "新对话"
    paper_id: Optional[int] = Field(default=None, foreign_key="paper.id")
    model: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
