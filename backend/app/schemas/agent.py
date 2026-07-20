"""Agent API request/response schemas."""
from pydantic import BaseModel, Field


class AgentScopeConfig(BaseModel):
    scope_type: str = "whole_library"
    category_id: int | None = None
    paper_id: int | None = None
    paper_ids: list[int] = Field(default_factory=list)


class AgentRunCreate(BaseModel):
    prompt: str
    scope: AgentScopeConfig
    model: str | None = None
    thinking: str = ""  # "", "none", "low", "medium", "high" — empty means use system default
    chat_session_id: int | None = None


class AgentToolEventResponse(BaseModel):
    id: int
    tool_name: str
    input_summary: str
    output_summary: str
    status: str
    error_message: str = ""


class AgentActionResponse(BaseModel):
    id: int
    agent_run_id: int
    action_type: str
    target_paper_id: int | None = None
    target_category_id: int | None = None
    before_values: dict = Field(default_factory=dict)
    after_values: dict = Field(default_factory=dict)
    rationale: str = ""
    confidence: float = 0.0
    risk_level: str = "low"
    status: str = "proposed"
    revert_action_id: int | None = None
    rejection_reason: str = ""
    error_message: str = ""


class AgentRunResponse(BaseModel):
    id: int
    prompt: str
    scope: AgentScopeConfig
    model: str
    status: str
    chat_session_id: int | None = None
    actions: list[AgentActionResponse] = Field(default_factory=list)
    tool_events: list[AgentToolEventResponse] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class BatchApproveRequest(BaseModel):
    action_ids: list[int]


class BatchApproveResponse(BaseModel):
    applied: int = 0
    skipped: int = 0
    failed: int = 0
    rejected: int = 0


class RejectRequest(BaseModel):
    reason: str = ""
