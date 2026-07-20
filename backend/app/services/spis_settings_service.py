from datetime import datetime, timezone

from sqlmodel import Session

from app.models.spis_settings import SpisSettings


MASKED_SECRET_SENTINELS = {"", "••••••••", "********"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _mask_secret(value: str, *, keep_prefix: int = 2, keep_suffix: int = 2) -> str:
    if not value:
        return ""
    if len(value) <= keep_prefix + keep_suffix:
        return "••••"
    return f"{value[:keep_prefix]}••••{value[-keep_suffix:]}"


def _is_masked_secret_value(value: str) -> bool:
    return value in MASKED_SECRET_SENTINELS or "••••" in value or "****" in value


class SpisSettingsService:
    SINGLETON_ID = 1

    @classmethod
    def get_settings(cls, session: Session) -> SpisSettings:
        row = session.get(SpisSettings, cls.SINGLETON_ID)
        if row is not None:
            return row

        row = SpisSettings(id=cls.SINGLETON_ID, enabled=False)
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @classmethod
    def to_response(cls, session: Session) -> dict:
        row = cls.get_settings(session)
        return {
            "account_set": bool(row.account),
            "account_preview": _mask_secret(row.account),
            "password_set": bool(row.password),
            "password_preview": "••••••••" if row.password else "",
            "enabled": bool(row.enabled),
        }

    @classmethod
    def update_settings(cls, session: Session, updates: dict) -> SpisSettings:
        row = cls.get_settings(session)

        account = updates.get("account")
        if account is not None and not _is_masked_secret_value(account):
            row.account = account

        password = updates.get("password")
        if password is not None and not _is_masked_secret_value(password):
            row.password = password

        if "enabled" in updates and updates["enabled"] is not None:
            row.enabled = bool(updates["enabled"])

        row.updated_at = _utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
