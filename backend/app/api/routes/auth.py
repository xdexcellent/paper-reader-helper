"""Authentication routes: login with account + password."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.core.auth import create_token, get_optional_user, validate_auth_settings
from app.core.db import get_session
from app.services.user_service import authenticate, has_any_user

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    account: str
    password: str


class LoginResponse(BaseModel):
    token: str
    message: str = "登录成功"


class AuthStatusResponse(BaseModel):
    authenticated: bool
    requires_password: bool


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, session: Session = Depends(get_session)) -> LoginResponse:
    auth_enabled = has_any_user(session)
    try:
        validate_auth_settings(auth_enabled)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    user = authenticate(session, req.account, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="账号或密码错误")

    token = create_token(username=user.username)
    return LoginResponse(token=token)


@router.get("/status", response_model=AuthStatusResponse)
def auth_status(
    user: str | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> AuthStatusResponse:
    """Check if auth is required (no token needed for this endpoint)."""
    return AuthStatusResponse(
        authenticated=bool(user),
        requires_password=has_any_user(session),
    )
