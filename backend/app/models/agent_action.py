from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class AgentAction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    agent_run_id: int = Field(index=True, foreign_key="agentrun.id")
    action_type: str = Field(index=True)
    target_paper_id: Optional[int] = Field(default=None, foreign_key="paper.id", index=True)
    target_category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    before_values_json: str = "{}"
    after_values_json: str = "{}"
    rationale: str = ""
    confidence: float = Field(default=0.0)
    risk_level: str = Field(default="low", index=True)
    status: str = Field(default="proposed", index=True)
    revert_action_id: Optional[int] = None
    rejection_reason: str = ""
    error_message: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
