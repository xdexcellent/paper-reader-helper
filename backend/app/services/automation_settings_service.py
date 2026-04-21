from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.models.automation_settings import AutomationSettings


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AutomationSettingsService:
    SINGLETON_ID = 1

    @classmethod
    def get_settings(cls, session: Session) -> AutomationSettings:
        settings = session.get(AutomationSettings, cls.SINGLETON_ID)
        if settings is not None:
            return settings

        settings = AutomationSettings(id=cls.SINGLETON_ID)
        session.add(settings)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            settings = session.get(AutomationSettings, cls.SINGLETON_ID)
            if settings is None:
                raise
            return settings
        session.refresh(settings)
        return settings

    @classmethod
    def update_settings(cls, session: Session, updates: dict) -> AutomationSettings:
        settings = cls.get_settings(session)
        for field_name, value in updates.items():
            setattr(settings, field_name, value)
        settings.updated_at = _utcnow()
        session.add(settings)
        session.commit()
        session.refresh(settings)
        return settings
