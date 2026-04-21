from app.core.auth import create_token
from app.core.config import settings


def test_login_rejects_default_jwt_secret_when_password_is_enabled(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "secret")
    monkeypatch.setattr(settings, "jwt_secret", "paper-reader-secret-change-me")

    response = client.post("/auth/login", json={"password": "secret"})

    assert response.status_code == 500
    assert "JWT_SECRET" in response.json()["detail"]


def test_login_allows_custom_jwt_secret_when_password_is_enabled(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "secret")
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")

    response = client.post("/auth/login", json={"password": "secret"})

    assert response.status_code == 200
    assert response.json()["token"]


def test_auth_status_reports_authenticated_when_token_is_valid(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "secret")
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")
    token = create_token()

    response = client.get(
        "/auth/status",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "requires_password": True,
    }


def test_auth_status_reports_unauthenticated_when_token_is_invalid(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "secret")
    monkeypatch.setattr(settings, "jwt_secret", "custom-secret-for-tests-1234567890")

    response = client.get(
        "/auth/status",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": False,
        "requires_password": True,
    }
