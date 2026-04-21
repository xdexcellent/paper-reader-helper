"""Authentication routes: login with app password."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import create_token, get_optional_user, verify_password
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    message: str = "登录成功"


class AuthStatusResponse(BaseModel):
    authenticated: bool
    requires_password: bool


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest) -> LoginResponse:
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="密码错误")
    try:
        token = create_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return LoginResponse(token=token)


@router.get("/status", response_model=AuthStatusResponse)
def auth_status(user: str | None = Depends(get_optional_user)) -> AuthStatusResponse:
    """Check if auth is required (no token needed for this endpoint)."""
    return AuthStatusResponse(
        authenticated=bool(user),
        requires_password=bool(settings.app_password),
    )
