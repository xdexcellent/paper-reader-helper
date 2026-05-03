from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.api.routes import recommendations
from app.core.db import engine
from app.models.paper import Paper


def test_recommendations_include_explainable_categories(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.services.deepseek_client.DeepSeekClient.chat",
        lambda *_args, **_kwargs: "[]",
    )
    recommendations._recommendation_cache = {}

    with Session(engine) as session:
        ready = Paper(
            title="Ready Reading Paper",
            source="arxiv",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            embedding_status="pending",
            category_status="manual_locked",
            tags_json='["LLM", "Agent"]',
            created_at=datetime(2026, 4, 23, tzinfo=timezone.utc),
        )
        needs_summary = Paper(
            title="Needs Summary Paper",
            source="manual",
            local_pdf_path="",
            status="parsed",
            parse_status="completed",
            summary_status="pending",
            embedding_status="pending",
            created_at=datetime(2026, 4, 23, tzinfo=timezone.utc),
        )
        failed = Paper(
            title="Broken Parse Paper",
            source="rss",
            local_pdf_path="",
            status="parse_failed",
            parse_status="failed",
            summary_status="pending",
            embedding_status="pending",
            created_at=datetime(2026, 4, 23, tzinfo=timezone.utc),
        )
        session.add(ready)
        session.add(needs_summary)
        session.add(failed)
        session.commit()

    response = client.get("/recommendations")

    assert response.status_code == 200
    body = response.json()
    by_title = {item["paper"]["title"]: item for item in body}
    assert by_title["Ready Reading Paper"]["category"] == "read_now"
    assert by_title["Ready Reading Paper"]["action_label"] == "开始阅读"
    assert by_title["Ready Reading Paper"]["signals"]
    assert by_title["Ready Reading Paper"]["score_breakdown"]
    assert by_title["Needs Summary Paper"]["category"] == "summarize_next"
    assert by_title["Broken Parse Paper"]["category"] == "recover"
