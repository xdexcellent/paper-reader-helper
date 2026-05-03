import json
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.db import engine
from app.core.timezone import get_local_today
from app.models.daily_briefing import (
    DailyBriefing,
    DailyBriefingPaperItem,
    DailyBriefingProjectItem,
)
from app.models.daily_run import DailyRun
from app.models.paper import Paper


def _create_briefing_snapshot(
    briefing_date: date,
    *,
    summary_markdown: str = "今日精选",
    trigger_type: str = "scheduled",
) -> int:
    with Session(engine) as session:
        run = DailyRun(
            run_date=briefing_date,
            scheduled_for=datetime(2026, 4, 19, 4, 0, tzinfo=timezone.utc),
            status="completed",
            trigger_type=trigger_type,
        )
        session.add(run)
        session.flush()
        paper = Paper(
            title="A Paper",
            source="arxiv",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
        )
        session.add(paper)
        session.flush()
        briefing = DailyBriefing(
            daily_run_id=run.id,
            briefing_date=briefing_date,
            status="completed",
            generated_at=datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),
            top_n=5,
            summary_markdown=summary_markdown,
            paper_count=1,
            project_count=1,
            source_count=2,
            fallback_used=False,
        )
        session.add(briefing)
        session.flush()
        session.add(
            DailyBriefingPaperItem(
                briefing_id=briefing.id,
                paper_id=paper.id,
                rank=1,
                score=0.9,
                reason="值得优先阅读",
                source_kind="arxiv",
            )
        )
        session.add(
            DailyBriefingProjectItem(
                briefing_id=briefing.id,
                ingestion_item_id=None,
                rank=1,
                title="openai/codex",
                url="https://github.com/openai/codex",
                summary="AI coding agent",
                source_kind="github_trending",
            )
        )
        session.commit()
        session.refresh(briefing)
        return briefing.id


def test_briefing_today_returns_latest_snapshot_payload(client: TestClient) -> None:
    _create_briefing_snapshot(date(2026, 4, 19))

    response = client.get("/briefing/today")

    assert response.status_code == 200
    body = response.json()
    assert body["briefing_date"] == "2026-04-19"
    assert body["status"] == "completed"
    assert body["summary_markdown"] == "今日精选"
    assert body["paper_count"] == 1
    assert body["project_count"] == 1
    assert body["source_count"] == 2
    assert body["fallback_used"] is True
    assert body["top_papers"] == [
        {
            "paper_id": 1,
            "rank": 1,
            "score": 0.9,
            "reason": "值得优先阅读",
            "source_kind": "arxiv",
            "title": "",
            "summary_text": "",
            "canonical_url": "",
            "pdf_url": "",
        }
    ]
    assert body["projects"] == [
        {
            "rank": 1,
            "title": "openai/codex",
            "url": "https://github.com/openai/codex",
            "summary": "AI coding agent",
            "source_kind": "github_trending",
        }
    ]


def test_briefing_date_returns_requested_snapshot(client: TestClient) -> None:
    _create_briefing_snapshot(date(2026, 4, 18), summary_markdown="旧日报")
    _create_briefing_snapshot(date(2026, 4, 19), summary_markdown="新日报")

    response = client.get("/briefing/2026-04-18")

    assert response.status_code == 200
    body = response.json()
    assert body["briefing_date"] == "2026-04-18"
    assert body["summary_markdown"] == "旧日报"
    assert body["fallback_used"] is False


def test_briefing_history_returns_recent_snapshots(client: TestClient) -> None:
    _create_briefing_snapshot(date(2026, 4, 18), summary_markdown="旧日报")
    _create_briefing_snapshot(date(2026, 4, 19), summary_markdown="新日报")

    response = client.get("/briefing/history?days=7")

    assert response.status_code == 200
    body = response.json()
    assert [item["briefing_date"] for item in body] == ["2026-04-19", "2026-04-18"]
    assert body[0]["paper_count"] == 1


def test_briefing_date_response_includes_run_context(client: TestClient) -> None:
    _create_briefing_snapshot(date(2026, 4, 19), trigger_type="manual")

    response = client.get("/briefing/2026-04-19")

    assert response.status_code == 200
    body = response.json()
    assert body["daily_run_id"] is not None
    assert body["trigger_type"] == "manual"


def _local_today() -> date:
    return get_local_today("Asia/Shanghai").date()


def test_today_automation_status_returns_run_and_fallback_context(client: TestClient) -> None:
    fallback_date = _local_today() - timedelta(days=1)
    _create_briefing_snapshot(fallback_date, trigger_type="scheduled")

    response = client.get("/automation/status/today")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["briefing_enabled"] is True
    assert body["today_run"] is None
    assert body["today_briefing_exists"] is False
    assert body["fallback_used"] is True
    assert body["fallback_briefing_date"] == fallback_date.isoformat()


def test_today_automation_status_returns_today_run_when_snapshot_exists(client: TestClient) -> None:
    today = _local_today()
    _create_briefing_snapshot(today, trigger_type="manual")

    response = client.get("/automation/status/today")

    assert response.status_code == 200
    body = response.json()
    assert body["today_run"]["status"] == "completed"
    assert body["today_run"]["trigger_type"] == "manual"
    assert body["today_briefing_exists"] is True
    assert body["fallback_used"] is False
    assert body["fallback_briefing_date"] is None


def test_today_automation_status_returns_subscription_issues(client: TestClient) -> None:
    today = _local_today()
    with Session(engine) as session:
        run = DailyRun(
            run_date=today,
            scheduled_for=datetime(2026, 4, 19, 4, 0, tzinfo=timezone.utc),
            status="running",
            trigger_type="manual",
            stats_json=json.dumps(
                {
                    "subscription_issues": [
                        {
                            "subscription_id": 7,
                            "subscription_name": "HF Daily Papers",
                            "source_kind": "hf_papers",
                            "severity": "error",
                            "message": "连接外部服务失败",
                        }
                    ]
                },
                ensure_ascii=False,
            ),
        )
        session.add(run)
        session.commit()

    response = client.get("/automation/status/today")

    assert response.status_code == 200
    issue = response.json()["today_run"]["subscription_issues"][0]
    assert issue["subscription_name"] == "HF Daily Papers"
    assert issue["severity"] == "error"
    assert issue["message"] == "连接外部服务失败"
