from pydantic import BaseModel, Field, field_validator


class AiProviderSettingsResponse(BaseModel):
    provider_name: str
    api_base: str
    api_key_set: bool
    api_key_preview: str = ""
    default_model: str
    available_models: list[str] = Field(default_factory=list)


class AiProviderSettingsUpdate(BaseModel):
    provider_name: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    available_models: list[str] | None = None

    @field_validator("provider_name", "api_base", "api_key", "default_model")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class AiProviderModelsRequest(BaseModel):
    api_base: str | None = None
    api_key: str | None = None

    @field_validator("api_base", "api_key")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class AiProviderModelsResponse(BaseModel):
    models: list[str]
