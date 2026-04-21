from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ChatMessageRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="chatsession.id")
    role: str  # 'user' | 'assistant' | 'system'
    content: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
