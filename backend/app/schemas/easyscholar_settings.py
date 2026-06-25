from pydantic import BaseModel, field_validator


class EasyScholarSettingsResponse(BaseModel):
    api_key_set: bool
    api_key_preview: str = ""
    enabled: bool


class EasyScholarSettingsUpdate(BaseModel):
    api_key: str | None = None
    enabled: bool | None = None

    @field_validator("api_key")
    @classmethod
    def strip_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()
