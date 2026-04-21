"""Simplified authentication: single password from .env, JWT tokens."""

import hmac
import time

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

_bearer = HTTPBearer(auto_error=False)
DEFAULT_JWT_SECRETS = {
    "",
    "paper-reader-secret-change-me",
    "change-this-to-a-long-random-value",
}


def validate_auth_settings() -> None:
    """Reject insecure auth configuration when password auth is enabled."""
    if settings.app_password and settings.jwt_secret in DEFAULT_JWT_SECRETS:
        raise RuntimeError(
            "JWT_SECRET must be changed when APP_PASSWORD is configured."
        )


def create_token() -> str:
    """Create a JWT token (valid for 7 days)."""
    validate_auth_settings()
    payload = {
        "sub": "user",
        "iat": int(time.time()),
        "exp": int(time.time()) + 7 * 86400,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_password(password: str) -> bool:
    """Check if the password matches the configured app password."""
    if not settings.app_password:
        # No password configured → always pass
        return True
    return hmac.compare_digest(password, settings.app_password)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependency: require valid JWT. Returns 'user' string."""
    if not settings.app_password:
        # No password configured → skip auth
        return "user"
    try:
        validate_auth_settings()
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
) -> str | None:
    """Dependency: optional auth. Returns user or None."""
    if not settings.app_password:
        return "user"
    try:
        validate_auth_settings()
    except RuntimeError:
        return None
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        return payload.get("sub", "user")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
