from pydantic import BaseModel, field_validator


class UserProfileResponse(BaseModel):
    username: str
    display_name: str = ""
    badge_text: str = ""


class UserProfileUpdate(BaseModel):
    display_name: str | None = None
    badge_text: str | None = None

    @field_validator("display_name", "badge_text")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("old_password", "new_password")
    @classmethod
    def strip_password(cls, value: str) -> str:
        return value.strip()
