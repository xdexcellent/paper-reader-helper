import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.timezone import is_valid_timezone


_TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class AutomationSettingsResponse(BaseModel):
    enabled: bool
    schedule_time: str
    timezone: str
    top_n: int
    briefing_enabled: bool
    project_sidebar_enabled: bool
    http_proxy: str | None = None
    https_proxy: str | None = None
    research_direction: str = ""
    research_keywords: str = ""

    model_config = ConfigDict(from_attributes=True)


class AutomationRunResponse(BaseModel):
    run_id: int | None
    status: str


class AutomationSubscriptionIssue(BaseModel):
    subscription_id: int | None = None
    subscription_name: str = ""
    source_kind: str = ""
    severity: str = "warning"
    message: str = ""


class AutomationRunStatus(BaseModel):
    id: int | None
    status: str
    trigger_type: str | None
    started_at: str | None
    completed_at: str | None
    error_message: str | None
    progress: int = 0
    progress_message: str = ""
    subscription_issues: list[AutomationSubscriptionIssue] = Field(default_factory=list)


class AutomationTodayStatusResponse(BaseModel):
    local_today: str
    enabled: bool
    briefing_enabled: bool
    schedule_time: str
    timezone: str
    today_run: AutomationRunStatus | None
    today_briefing_exists: bool
    fallback_used: bool
    fallback_briefing_date: str | None


class AutomationSettingsUpdate(BaseModel):
    enabled: bool | None = None
    schedule_time: str | None = None
    timezone: str | None = None
    top_n: int | None = None
    briefing_enabled: bool | None = None
    project_sidebar_enabled: bool | None = None
    http_proxy: str | None = None
    https_proxy: str | None = None
    research_direction: str | None = None
    research_keywords: str | None = None

    @field_validator("schedule_time")
    @classmethod
    def validate_schedule_time(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not _TIME_PATTERN.fullmatch(value):
            raise ValueError("schedule_time must use HH:MM format")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not is_valid_timezone(value):
            raise ValueError("timezone must be a valid IANA timezone")
        return value

    @field_validator("top_n")
    @classmethod
    def validate_top_n(cls, value: int | None) -> int | None:
        if value is None:
            return value
        if not 1 <= value <= 20:
            raise ValueError("top_n must be between 1 and 20")
        return value
