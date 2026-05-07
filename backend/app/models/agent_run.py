from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class AgentRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    prompt: str = ""
    scope_type: str = Field(default="whole_library", index=True)
    scope_config_json: str = "{}"
    model: str = Field(default="gpt-5.4", index=True)
    status: str = Field(default="pending", index=True)
    chat_session_id: Optional[int] = Field(default=None, foreign_key="chatsession.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
