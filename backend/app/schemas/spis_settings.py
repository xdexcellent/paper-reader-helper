from pydantic import BaseModel, field_validator


class SpisSettingsResponse(BaseModel):
    account_set: bool
    account_preview: str = ""
    password_set: bool
    password_preview: str = ""
    enabled: bool


class SpisSettingsUpdate(BaseModel):
    account: str | None = None
    password: str | None = None
    enabled: bool | None = None

    @field_validator("account", "password")
    @classmethod
    def strip_secret_fields(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()
