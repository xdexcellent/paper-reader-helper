"""User profile routes: view/update profile and change password."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.models.user import User
from app.schemas.users import (
    ChangePasswordRequest,
    UserProfileResponse,
    UserProfileUpdate,
)
from app.services.user_service import get_sole_user, hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])

MIN_PASSWORD_LENGTH = 6


def _profile_response(user: User | None) -> UserProfileResponse:
    if user is None:
        return UserProfileResponse(username="user", display_name="", badge_text="")
    return UserProfileResponse(
        username=user.username,
        display_name=user.display_name,
        badge_text=user.badge_text,
    )


@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    return _profile_response(get_sole_user(session))


@router.put("/me", response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdate,
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    user = get_sole_user(session)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    data = payload.model_dump(exclude_unset=True)
    if "display_name" in data:
        user.display_name = data["display_name"]
    if "badge_text" in data:
        user.badge_text = data["badge_text"]
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    return _profile_response(user)


@router.post("/me/password")
def change_my_password(
    payload: ChangePasswordRequest,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    user = get_sole_user(session)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="旧密码错误")
    if len(payload.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"新密码长度至少 {MIN_PASSWORD_LENGTH} 位",
        )
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    return {"message": "密码修改成功"}
