"""Tests for Agent API routes — run creation, approval, rejection, revert."""
import json

import pytest
from sqlmodel import Session, select

from app.core.db import engine


def _seed_paper(session: Session, **kwargs) -> int:
    from app.models.paper import Paper, CategoryStatus
    defaults = {
        "title": "Test Paper",
        "source": "manual",
        "local_pdf_path": "/data/test.pdf",
        "authors": "Author A",
        "year": 2024,
        "venue": "Venue",
        "doi": "10.1234/test",
        "url": "https://example.com",
        "favorite": False,
        "reading_status": "unread",
        "reading_progress": 0,
        "user_notes": "",
        "status": "ready",
        "parse_status": "completed",
        "summary_status": "completed",
        "tags_json": "[]",
        "primary_category_id": None,
        "category_confidence": 0.0,
        "category_status": CategoryStatus.PENDING_REVIEW,
    }
    defaults.update(kwargs)
    paper = Paper(**defaults)
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper.id


def _seed_category(session: Session, **kwargs) -> int:
    from app.models.category import Category
    defaults = {"name": "CatX", "slug": "cat-x", "is_system": True, "is_active": True, "sort_order": 0}
    defaults.update(kwargs)
    cat = Category(**defaults)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat.id


# ── run creation ──────────────────────────────────────────────

def test_create_agent_run_with_valid_proposal(mocker, client):
    """POST /agent/runs creates run, calls model, and returns proposals."""
    # Mock the model chat response to return a valid proposal
    mock_response = json.dumps({
        "actions": [
            {
                "action_type": "update_paper_metadata",
                "target_paper_id": 1,
                "after_values": {"title": "新标题", "favorite": True},
                "rationale": "这是一篇重要论文",
                "confidence": 0.9,
                "risk_level": "low",
            }
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    # Seed a paper so the scope has real data
    with Session(engine) as session:
        _seed_paper(session, title="测试论文")

    response = client.post(
        "/agent/runs",
        json={
            "prompt": "推荐3篇最相关的论文并标记为收藏",
            "scope": {"scope_type": "whole_library"},
            "model": "gpt-5.4",
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert body["status"] == "completed"
    assert len(body["actions"]) == 1
    assert body["actions"][0]["action_type"] == "update_paper_metadata"
    assert body["actions"][0]["status"] == "proposed"
    assert body["actions"][0]["target_paper_id"] == 1


def test_create_agent_run_model_failure(mocker, client):
    """When model call fails, run is marked as failed."""
    # Mock chat to raise an error
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value="AI 供应商 API Key 未配置，无法进行真实对话。请在偏好设置中配置 API Key。",
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test")

    response = client.post(
        "/agent/runs",
        json={
            "prompt": "帮我整理论文库",
            "scope": {"scope_type": "whole_library"},
            "model": "gpt-5.4",
        },
    )

    body = response.json()
    # 201 still created, but status is failed
    assert response.status_code == 201
    assert body["status"] == "failed"
    assert len(body["actions"]) == 0


def test_create_agent_run_malformed_model_response(mocker, client):
    """When model returns unparseable JSON, run is marked as failed."""
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value="这不是JSON",
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test")

    response = client.post(
        "/agent/runs",
        json={
            "prompt": "整理论文",
            "scope": {"scope_type": "whole_library"},
            "model": "gpt-5.4",
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert body["status"] == "failed"


# ── list runs ─────────────────────────────────────────────────

def test_list_agent_runs(mocker, client):
    """GET /agent/runs lists recent runs."""
    mock_response = json.dumps({"actions": []}, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test")

    # Create two runs
    client.post("/agent/runs", json={
        "prompt": "Run 1", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    client.post("/agent/runs", json={
        "prompt": "Run 2", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })

    response = client.get("/agent/runs")
    assert response.status_code == 200
    runs = response.json()
    assert len(runs) == 2
    assert runs[0]["prompt"] == "Run 2"  # newest first


# ── get run detail ────────────────────────────────────────────

def test_get_agent_run_detail(mocker, client):
    """GET /agent/runs/{id} returns run with actions and tool events."""
    mock_response = json.dumps({
        "actions": [
            {"action_type": "update_paper_metadata", "target_paper_id": 1,
             "after_values": {"favorite": True}, "rationale": "重要", "confidence": 0.8, "risk_level": "low"},
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test")

    create_resp = client.post("/agent/runs", json={
        "prompt": "Detail test", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    run_id = create_resp.json()["id"]

    response = client.get(f"/agent/runs/{run_id}")
    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == run_id
    assert detail["prompt"] == "Detail test"
    assert len(detail["actions"]) == 1
    # Should have tool events
    assert len(detail["tool_events"]) > 0


def test_get_agent_run_not_found(client):
    """GET /agent/runs/{id} returns 404 for missing run."""
    response = client.get("/agent/runs/99999")
    assert response.status_code == 404


# ── approve action ────────────────────────────────────────────

def test_approve_action_executes_write(mocker, client):
    """POST /agent/actions/{id}/approve executes the proposed write."""
    mock_response = json.dumps({
        "actions": [
            {"action_type": "update_paper_metadata", "target_paper_id": 1,
             "after_values": {"favorite": True}, "rationale": "标记收藏", "confidence": 0.9, "risk_level": "low"},
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test Paper", favorite=False)

    create_resp = client.post("/agent/runs", json={
        "prompt": "Approve test", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    run_data = create_resp.json()
    action_id = run_data["actions"][0]["id"]

    # Approve it
    approve_resp = client.post(f"/agent/actions/{action_id}/approve")
    assert approve_resp.status_code == 200
    action = approve_resp.json()
    assert action["status"] == "executed"

    # Verify paper was actually updated
    from app.models.paper import Paper
    with Session(engine) as session:
        paper = session.get(Paper, 1)
        assert paper.favorite is True


def test_approve_action_not_found(client):
    """POST /agent/actions/{id}/approve returns 404 for missing action."""
    response = client.post("/agent/actions/99999/approve")
    assert response.status_code == 404


# ── reject action ─────────────────────────────────────────────

def test_reject_action(mocker, client):
    """POST /agent/actions/{id}/reject marks the action as rejected."""
    mock_response = json.dumps({
        "actions": [
            {"action_type": "update_paper_metadata", "target_paper_id": 1,
             "after_values": {"favorite": True}, "rationale": "标记收藏", "confidence": 0.5, "risk_level": "low"},
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="Test")

    create_resp = client.post("/agent/runs", json={
        "prompt": "Reject test", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    action_id = create_resp.json()["actions"][0]["id"]

    # Reject it
    reject_resp = client.post(f"/agent/actions/{action_id}/reject", json={"reason": "不需要"})
    assert reject_resp.status_code == 200
    action = reject_resp.json()
    assert action["status"] == "rejected"
    assert action["rejection_reason"] == "不需要"


# ── batch approve ─────────────────────────────────────────────

def test_batch_approve_actions(mocker, client):
    """POST /agent/runs/{run_id}/approve-batch returns counts."""
    mock_response = json.dumps({
        "actions": [
            {"action_type": "update_paper_metadata", "target_paper_id": 1,
             "after_values": {"favorite": True}, "rationale": "收藏", "confidence": 0.9, "risk_level": "low"},
            {"action_type": "update_paper_metadata", "target_paper_id": 2,
             "after_values": {"reading_status": "read"}, "rationale": "已读", "confidence": 0.8, "risk_level": "low"},
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="P1", favorite=False)
        _seed_paper(session, title="P2", reading_status="unread")

    create_resp = client.post("/agent/runs", json={
        "prompt": "Batch test", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    run_data = create_resp.json()
    run_id = run_data["id"]
    action_ids = [a["id"] for a in run_data["actions"]]

    batch_resp = client.post(f"/agent/runs/{run_id}/approve-batch", json={"action_ids": action_ids})
    assert batch_resp.status_code == 200
    result = batch_resp.json()
    assert result["applied"] == 2
    assert result["failed"] == 0


# ── revert action ─────────────────────────────────────────────

def test_revert_action(mocker, client):
    """POST /agent/actions/{id}/revert reverts an executed action."""
    mock_response = json.dumps({
        "actions": [
            {"action_type": "update_paper_metadata", "target_paper_id": 1,
             "after_values": {"favorite": True}, "rationale": "收藏", "confidence": 0.9, "risk_level": "low"},
        ]
    }, ensure_ascii=False)
    mocker.patch(
        "app.services.agent_runner_service.DeepSeekClient.chat",
        return_value=mock_response,
    )

    with Session(engine) as session:
        _seed_paper(session, title="Revert Paper", favorite=False)

    create_resp = client.post("/agent/runs", json={
        "prompt": "Revert test", "scope": {"scope_type": "whole_library"}, "model": "gpt-5.4",
    })
    action_id = create_resp.json()["actions"][0]["id"]

    # First approve
    client.post(f"/agent/actions/{action_id}/approve")

    # Then revert
    revert_resp = client.post(f"/agent/actions/{action_id}/revert")
    assert revert_resp.status_code == 200
    reverted = revert_resp.json()
    assert reverted["status"] == "reverted"

    # Verify paper state restored
    from app.models.paper import Paper
    with Session(engine) as session:
        paper = session.get(Paper, 1)
        assert paper.favorite is False


# ── auth protection ───────────────────────────────────────────

def test_agent_routes_accessible_when_auth_disabled(client):
    """Agent routes are accessible when auth is disabled (default in test)."""
    # The conftest sets APP_PASSWORD="", so auth is disabled by default.
    # All requests should pass.
    response = client.get("/agent/runs")
    # Auth disabled: should work
    assert response.status_code == 200
