from datetime import datetime, timezone

from sqlmodel import Session

from app.models.easyscholar_settings import EasyScholarSettings


MASKED_API_KEY_SENTINELS = {"", "••••••••", "********"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "••••"
    return f"{api_key[:4]}••••{api_key[-4:]}"


def _is_masked_api_key_value(api_key: str) -> bool:
    return api_key in MASKED_API_KEY_SENTINELS or "••••" in api_key or "****" in api_key


class EasyScholarSettingsService:
    SINGLETON_ID = 1

    @classmethod
    def get_settings(cls, session: Session) -> EasyScholarSettings:
        row = session.get(EasyScholarSettings, cls.SINGLETON_ID)
        if row is not None:
            return row

        row = EasyScholarSettings(id=cls.SINGLETON_ID)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @classmethod
    def to_response(cls, session: Session) -> dict:
        row = cls.get_settings(session)
        return {
            "api_key_set": bool(row.api_key),
            "api_key_preview": _mask_api_key(row.api_key),
            "enabled": row.enabled,
        }

    @classmethod
    def update_settings(cls, session: Session, updates: dict) -> EasyScholarSettings:
        row = cls.get_settings(session)

        api_key = updates.get("api_key")
        if api_key is not None and not _is_masked_api_key_value(api_key):
            row.api_key = api_key
        if "enabled" in updates:
            row.enabled = updates["enabled"]

        row.updated_at = _utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
