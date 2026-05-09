from pathlib import Path

from fastapi.testclient import TestClient


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "embedding_available" in data


def test_health_endpoint_reports_embedding_availability(client: TestClient) -> None:
    """The health endpoint should report whether embedding is available."""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    # embedding_available is a boolean — True if sentence-transformers is installed
    assert isinstance(data["embedding_available"], bool)


def test_client_startup_creates_sqlite_parent_directory(client: TestClient) -> None:
    assert Path("test-data").is_dir()
