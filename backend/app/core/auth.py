"""Authentication: single-user account + bcrypt password, JWT tokens."""

import time

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.config import settings
from app.core.db import get_session
from app.services.user_service import has_any_user

_bearer = HTTPBearer(auto_error=False)
DEFAULT_JWT_SECRETS = {
    "",
    "paper-reader-secret-change-me",
    "change-this-to-a-long-random-value",
}


def validate_auth_settings(auth_enabled: bool) -> None:
    """Reject insecure auth configuration when password auth is enabled."""
    if auth_enabled and settings.jwt_secret in DEFAULT_JWT_SECRETS:
        raise RuntimeError(
            "JWT_SECRET must be changed when APP_PASSWORD is configured."
        )


def create_token(username: str) -> str:
    """Create a JWT token (valid for 7 days)."""
    payload = {
        "sub": username,
        "iat": int(time.time()),
        "exp": int(time.time()) + 7 * 86400,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> str:
    """Dependency: require valid JWT when a user exists. Returns username."""
    if not has_any_user(session):
        # No user in DB → skip auth
        return "user"
    try:
        validate_auth_settings(auth_enabled=True)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录，请先输入密码",
        )

    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        return payload.get("sub", "user")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的登录凭证",
        )


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> str | None:
    """Dependency: optional auth. Returns user or None."""
    if not has_any_user(session):
        return "user"
    try:
        validate_auth_settings(auth_enabled=True)
    except RuntimeError:
        return None
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        return payload.get("sub", "user")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
