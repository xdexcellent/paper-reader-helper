import time
from pathlib import Path

from sqlmodel import Session

from app.core.db import engine
from app.core.config import settings
from app.main import app
from app.models.paper import Paper


def _wait_for_task(client, task_id: str, timeout: float = 2.0) -> dict:
    deadline = time.monotonic() + timeout
    last_body: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/tasks/{task_id}")
        assert response.status_code == 200
        last_body = response.json()
        if last_body["status"] in {"completed", "failed"}:
            return last_body
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish; last body={last_body}")


def test_parse_background_task_reports_failed_when_pipeline_raises(client, mocker, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "")
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Parse Failure",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]
    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        side_effect=RuntimeError("parse exploded"),
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = _wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "failed"
    assert "parse exploded" in task_body["error"]


def test_parse_background_task_reports_failed_when_mineru_is_unavailable(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_password", "")
    monkeypatch.setattr(settings, "mineru_api_token", "")
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Parse Failure",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = _wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "failed"
    assert "MINERU_API_TOKEN" in task_body["error"]

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)

    assert paper is not None
    assert paper.parse_status == "failed"
    assert paper.status == "parse_failed"


def test_papers_router_has_single_embed_route() -> None:
    matches = [
        route
        for route in app.routes
        if getattr(route, "path", None) == "/papers/{paper_id}/embed"
        and "POST" in getattr(route, "methods", set())
    ]

    assert len(matches) == 1


def test_legacy_semantic_search_route_is_removed() -> None:
    matches = [
        route
        for route in app.routes
        if getattr(route, "path", None) == "/papers/semantic_search"
    ]

    assert matches == []
