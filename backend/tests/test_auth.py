"""Authentication tests for single-user account + bcrypt login."""

from sqlmodel import Session

from app.core.auth import create_token
from app.core.config import settings
from app.core.db import engine
from app.services.user_service import hash_password
from app.models.user import User


def _create_test_user(
    username: str = "testadmin",
    password: str = "test-password-123",
) -> None:
    """Insert a test user directly into the database."""
    with Session(engine) as session:
        user = User(username=username, password_hash=hash_password(password))
        session.add(user)
        session.commit()


# ── Login ────────────────────────────────────────────────────


def test_login_success_with_correct_credentials(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.post("/auth/login", json={"account": "testadmin", "password": "test-password-123"})
    assert response.status_code == 200
    assert response.json()["token"]
    assert response.json()["message"] == "登录成功"


def test_login_fails_with_wrong_account(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.post("/auth/login", json={"account": "wronguser", "password": "test-password-123"})
    assert response.status_code == 401
    assert response.json()["detail"] == "账号或密码错误"


def test_login_fails_with_wrong_password(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.post("/auth/login", json={"account": "testadmin", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["detail"] == "账号或密码错误"


def test_login_rejects_default_jwt_secret_when_user_exists(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "paper-reader-secret-change-me")
    _create_test_user()
    response = client.post("/auth/login", json={"account": "testadmin", "password": "test-password-123"})
    assert response.status_code == 500
    assert "JWT_SECRET" in response.json()["detail"]


def test_login_allows_custom_jwt_secret(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.post("/auth/login", json={"account": "testadmin", "password": "test-password-123"})
    assert response.status_code == 200
    assert response.json()["token"]


# ── Auth Status ──────────────────────────────────────────────


def test_status_no_user_means_no_auth_required(client) -> None:
    response = client.get("/auth/status")
    assert response.status_code == 200
    data = response.json()
    assert data["requires_password"] is False
    assert data["authenticated"] is True  # auto-authenticated when no user


def test_status_with_user_requires_password(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.get("/auth/status")
    assert response.status_code == 200
    data = response.json()
    assert data["requires_password"] is True
    assert data["authenticated"] is False


def test_status_authenticated_with_valid_token(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    token = create_token(username="testadmin")
    response = client.get("/auth/status", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is True
    assert data["requires_password"] is True


def test_status_unauthenticated_with_invalid_token(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.get("/auth/status", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 200
    data = response.json()
    assert data["authenticated"] is False
    assert data["requires_password"] is True


# ── Protected Endpoints ──────────────────────────────────────


def test_protected_endpoint_requires_token_when_user_exists(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    response = client.get("/papers")
    assert response.status_code == 401


def test_protected_endpoint_accessible_with_valid_token(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    _create_test_user()
    token = create_token(username="testadmin")
    response = client.get("/papers", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_no_user_no_auth_needed(client) -> None:
    response = client.get("/papers")
    assert response.status_code == 200
