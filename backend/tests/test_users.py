"""User profile routes tests: view/update profile and change password."""

from sqlmodel import Session, select

from app.core.auth import create_token
from app.core.config import settings
from app.core.db import engine
from app.models.user import User
from app.services.user_service import hash_password


def _create_test_user(
    username: str = "testadmin",
    password: str = "test-password-123",
    display_name: str = "",
    badge_text: str = "",
) -> User:
    """Insert a test user directly into the database and return it."""
    with Session(engine) as session:
        user = User(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name,
            badge_text=badge_text,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def _auth_headers(username: str = "testadmin") -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(username=username)}"}


# ── GET /users/me ─────────────────────────────────────────────


def test_get_profile_no_user_returns_fallback(client) -> None:
    response = client.get("/users/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {"username": "user", "display_name": "", "badge_text": ""}


def test_get_profile_with_user_returns_defaults(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.get("/users/me", headers=_auth_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "testadmin"
    assert payload["display_name"] == ""
    assert payload["badge_text"] == ""


def test_get_profile_with_saved_fields(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user(display_name="张三", badge_text="博士在读")
    response = client.get("/users/me", headers=_auth_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["display_name"] == "张三"
    assert payload["badge_text"] == "博士在读"


def test_get_profile_requires_token_when_user_exists(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.get("/users/me")
    assert response.status_code == 401


# ── PUT /users/me ─────────────────────────────────────────────


def test_update_profile_persists_both_fields(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.put(
        "/users/me",
        json={"display_name": "李四", "badge_text": "硕士在读"},
        headers=_auth_headers(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["display_name"] == "李四"
    assert payload["badge_text"] == "硕士在读"

    with Session(engine) as session:
        row = session.exec(select(User)).first()
        assert row is not None
        assert row.display_name == "李四"
        assert row.badge_text == "硕士在读"


def test_update_profile_partial_update_keeps_other_field(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user(display_name="原名", badge_text="原徽章")
    response = client.put(
        "/users/me",
        json={"display_name": "新名"},
        headers=_auth_headers(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["display_name"] == "新名"
    assert payload["badge_text"] == "原徽章"


def test_update_profile_strips_whitespace(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.put(
        "/users/me",
        json={"display_name": "  王五  ", "badge_text": "  研究员  "},
        headers=_auth_headers(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["display_name"] == "王五"
    assert payload["badge_text"] == "研究员"


# ── POST /users/me/password ───────────────────────────────────


def test_change_password_success_allows_new_password_login(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user(password="old-password-123")
    response = client.post(
        "/users/me/password",
        json={"old_password": "old-password-123", "new_password": "new-password-456"},
        headers=_auth_headers(),
    )
    assert response.status_code == 200
    assert response.json()["message"] == "密码修改成功"

    login_old = client.post(
        "/auth/login",
        json={"account": "testadmin", "password": "old-password-123"},
    )
    assert login_old.status_code == 401

    login_new = client.post(
        "/auth/login",
        json={"account": "testadmin", "password": "new-password-456"},
    )
    assert login_new.status_code == 200


def test_change_password_wrong_old_password_returns_400(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user(password="correct-old-123")
    response = client.post(
        "/users/me/password",
        json={"old_password": "wrong-old-password", "new_password": "new-password-456"},
        headers=_auth_headers(),
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "旧密码错误"


def test_change_password_too_short_new_password_returns_400(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user(password="old-password-123")
    response = client.post(
        "/users/me/password",
        json={"old_password": "old-password-123", "new_password": "12345"},
        headers=_auth_headers(),
    )
    assert response.status_code == 400
    assert "新密码长度至少" in response.json()["detail"]


def test_change_password_requires_token_when_user_exists(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.post(
        "/users/me/password",
        json={"old_password": "test-password-123", "new_password": "new-password-456"},
    )
    assert response.status_code == 401
