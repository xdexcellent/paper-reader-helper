"""User service: password hashing, authentication, and bootstrap."""

import logging

import bcrypt
from sqlmodel import Session, select

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


# ── Password helpers ────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of *plain*."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Check *plain* against a bcrypt *hashed* value."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── Repository helpers ──────────────────────────────────────


def has_any_user(session: Session) -> bool:
    """Return ``True`` if the user table contains at least one row."""
    return session.exec(select(User).limit(1)).first() is not None


def get_sole_user(session: Session) -> User | None:
    """Return the single user record, or ``None``."""
    return session.exec(select(User).limit(1)).first()


# ── Authentication ──────────────────────────────────────────


def authenticate(session: Session, account: str, password: str) -> User | None:
    """Validate *account* + *password* against the sole user.

    Returns the ``User`` on success, ``None`` on failure.
    """
    user = get_sole_user(session)
    if user is None:
        return None
    if account.strip() != user.username:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ── Bootstrap ───────────────────────────────────────────────


def bootstrap_user_if_needed(session: Session) -> None:
    """Create the initial admin user when the table is empty and
    ``APP_PASSWORD`` (+ optional ``APP_USERNAME``) are configured.

    This runs once at startup via ``init_db()``.
    """
    if has_any_user(session):
        return

    if not settings.app_password:
        logger.info("用户表为空且未配置 APP_PASSWORD，跳过 bootstrap（无需登录）")
        return

    username = (settings.app_username or "").strip() or "admin"
    user = User(
        username=username,
        password_hash=hash_password(settings.app_password),
    )
    session.add(user)
    session.commit()
    logger.info("Bootstrap: 创建初始用户 '%s'", username)
