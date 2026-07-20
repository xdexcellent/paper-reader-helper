import time

from sqlmodel import Session

from app.core.db import engine
from app.models.paper import Paper
from app.services.category_service import ensure_default_categories
from app.services.task_queue import BackgroundTaskQueue


def _seed_rescue_paper() -> int:
    with Session(engine) as session:
        ensure_default_categories(session)
        paper = Paper(
            source="crossref",
            title="Manual Rescue Paper",
            authors="Alice",
            local_pdf_path="",
            doi="10.1234/manual-rescue",
            source_pdf_status="metadata_only",
            spis_status="available_for_rescue",
            spis_reason="待 SPIS 补救",
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper.id


def test_spis_rescue_endpoint_submits_async_task(client, monkeypatch) -> None:
    paper_id = _seed_rescue_paper()
    calls: list[int] = []

    class _FakeSpis:
        def attempt_for_paper(self, session, paper, item=None, run_pipeline_on_success=True, force=False):
            calls.append(paper.id)
            paper.spis_status = "recovered"
            paper.spis_reason = "ok"
            paper.local_pdf_path = "x.pdf"
            paper.source_pdf_status = "available"
            session.add(paper)
            session.commit()
            return type("R", (), {"status": "recovered", "reason": "ok"})()

    monkeypatch.setattr(
        "app.services.spis_fallback_service.SpisFallbackService",
        lambda: _FakeSpis(),
    )

    response = client.post(f"/papers/{paper_id}/spis-rescue")
    assert response.status_code == 202
    payload = response.json()
    assert payload["message"] == "已提交 SPIS 补救任务"
    assert payload["task_id"]

    # wait background task
    for _ in range(50):
        if calls:
            break
        time.sleep(0.05)
    assert calls == [paper_id]

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        assert paper is not None
        assert paper.spis_status in {"queued", "recovered", "running", "available_for_rescue", "failed", "manual_required", "blocked_global"}


def test_spis_rescue_endpoint_rejects_duplicate_active_task(client, monkeypatch) -> None:
    paper_id = _seed_rescue_paper()

    # Force has_active_task True on the singleton class used by the route.
    monkeypatch.setattr(
        BackgroundTaskQueue,
        "has_active_task",
        lambda self, task_type, pid=None: True,
    )

    response = client.post(f"/papers/{paper_id}/spis-rescue")
    assert response.status_code == 409
    assert "正在进行中" in response.text


def test_spis_rescue_endpoint_rejects_non_eligible_paper(client) -> None:
    with Session(engine) as session:
        ensure_default_categories(session)
        paper = Paper(
            source="arxiv",
            title="Complete Paper",
            local_pdf_path="/tmp/a.pdf",
            source_pdf_status="available",
            spis_status="recovered",
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)
        paper_id = paper.id

    response = client.post(f"/papers/{paper_id}/spis-rescue")
    assert response.status_code == 400
