from pathlib import Path

from fastapi.testclient import TestClient


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_client_startup_creates_sqlite_parent_directory(client: TestClient) -> None:
    assert Path("test-data").is_dir()
