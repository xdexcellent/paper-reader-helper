from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class AgentToolEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    agent_run_id: int = Field(index=True, foreign_key="agentrun.id")
    tool_name: str = Field(index=True)
    input_summary: str = ""
    output_summary: str = ""
    status: str = Field(default="success")
    error_message: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
