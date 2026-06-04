from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AutomationSettings(SQLModel, table=True):
    __tablename__ = "automation_settings"

    id: int | None = Field(default=1, primary_key=True)
    enabled: bool = True
    schedule_time: str = "12:00"
    timezone: str = "Asia/Shanghai"
    top_n: int = 5
    briefing_enabled: bool = True
    project_sidebar_enabled: bool = True
    # Proxy settings for external API calls
    http_proxy: str | None = None
    https_proxy: str | None = None
    # User research direction (for briefing relevance scoring and LLM prompts)
    research_direction: str = ""  # 例如: "计算机视觉、扩散模型、CS 在医学中的应用"
    research_keywords: str = ""  # 逗号分隔: "diffusion, medical image, CT, MRI, segmentation"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
