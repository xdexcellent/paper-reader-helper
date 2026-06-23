from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AiProviderSettings(SQLModel, table=True):
    __tablename__ = "ai_provider_settings"

    id: int | None = Field(default=1, primary_key=True)
    provider_name: str = "OpenAI Compatible"
    api_base: str = ""
    api_key: str = ""
    default_model: str = ""
    available_models_json: str = "[]"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
