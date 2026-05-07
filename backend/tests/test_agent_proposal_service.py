"""Tests for AgentProposalService — validation, execution, revert, and batch."""
import json

import pytest
from sqlmodel import Session

from app.core.db import engine


def _ensure_agent_run(session: Session) -> int:
    """Ensure at least one AgentRun exists for FK references."""
    from sqlmodel import select
    from app.models.agent_run import AgentRun
    runs = list(session.exec(select(AgentRun)).all())
    if runs:
        return runs[0].id
    run = AgentRun(prompt="test", scope_type="whole_library", model="gpt-5.4", status="completed")
    session.add(run)
    session.commit()
    session.refresh(run)
    return run.id


def _create_action(session: Session, **kwargs) -> dict:
    from app.models.agent_action import AgentAction

    run_id = _ensure_agent_run(session)
    defaults = {
        "agent_run_id": run_id,
        "action_type": "update_paper_metadata",
        "target_paper_id": None,
        "target_category_id": None,
        "before_values_json": "{}",
        "after_values_json": "{}",
        "rationale": "",
        "confidence": 0.5,
        "risk_level": "low",
        "status": "proposed",
    }
    defaults.update(kwargs)
    action = AgentAction(**defaults)
    session.add(action)
    session.commit()
    session.refresh(action)
    return {"id": action.id}


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


# ── validate_proposal ────────────────────────────────────────

def test_validate_blocks_delete_paper(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        aid = _create_action(session, action_type="delete_paper")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.validate_proposal(session, action)
        assert result.status == "failed"
        assert "禁止" in result.error_message


def test_validate_blocks_unknown_action(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        aid = _create_action(session, action_type="unknown_action")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.validate_proposal(session, action)
        assert result.status == "failed"


def test_validate_missing_target_paper(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        # Use target_paper_id=None to trigger "缺少 target_paper_id" error
        aid = _create_action(session, action_type="update_paper_metadata", target_paper_id=None)["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.validate_proposal(session, action)
        assert result.status == "failed"
        assert "target_paper_id" in result.error_message.lower() or "缺少" in result.error_message


def test_validate_missing_category(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session)
        # Use target_category_id=None to trigger "缺少 target_category_id" error
        aid = _create_action(session, action_type="assign_category",
                            target_paper_id=pid, target_category_id=None)["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.validate_proposal(session, action)
        assert result.status == "failed"
        assert "target_category_id" in result.error_message.lower() or "缺少" in result.error_message


def test_validate_passes_for_valid(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session)
        aid = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid,
                            after_values_json=json.dumps({"title": "新标题"}), status="proposed")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.validate_proposal(session, action)
        assert result.status == "proposed"  # unchanged


# ── execute_action ───────────────────────────────────────────

def test_execute_update_paper_metadata(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session, title="旧标题", authors="Old Author")
        aid = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid,
                            after_values_json=json.dumps({"title": "新标题", "favorite": True}))["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.execute_action(session, action)
        assert result.status == "executed"

        # Verify paper was updated
        paper = session.get(Paper, pid)
        assert paper.title == "新标题"
        assert paper.favorite is True
        assert paper.authors == "Old Author"  # unchanged

        # Verify before/after recorded
        before = json.loads(result.before_values_json)
        assert before["title"] == "旧标题"
        after = json.loads(result.after_values_json)
        assert after["title"] == "新标题"


def test_execute_update_tags(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session, tags_json=json.dumps(["old-tag"]))
        aid = _create_action(session, action_type="update_tags", target_paper_id=pid,
                            after_values_json=json.dumps({"tags": ["new-tag", "agent-tag"]}))["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.execute_action(session, action)
        assert result.status == "executed"

        paper = session.get(Paper, pid)
        assert paper.tags == ["new-tag", "agent-tag"]


def test_execute_update_category(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session)
        cid = _seed_category(session, name="TargetCat", slug="target-cat")
        aid = _create_action(session, action_type="update_category",
                            target_paper_id=pid, target_category_id=cid)["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.execute_action(session, action)
        assert result.status == "executed"

        paper = session.get(Paper, pid)
        assert paper.primary_category_id == cid


def test_execute_create_category(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.category import Category
    svc = AgentProposalService()
    with Session(engine) as session:
        aid = _create_action(session, action_type="create_category",
                            after_values_json=json.dumps({"name": "新建分类", "description": "描述"}))["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.execute_action(session, action)
        assert result.status == "executed"

        after = json.loads(result.after_values_json)
        assert after["name"] == "新建分类"
        assert after["id"] is not None
        assert result.target_category_id == after["id"]


def test_execute_assign_category(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session)
        cid = _seed_category(session, name="AssignedCat", slug="assigned-cat")
        aid = _create_action(session, action_type="assign_category",
                            target_paper_id=pid, target_category_id=cid)["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.execute_action(session, action)
        assert result.status == "executed"

        paper = session.get(Paper, pid)
        assert paper.primary_category_id == cid


# ── reject_action ────────────────────────────────────────────

def test_reject_action(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        aid = _create_action(session, status="proposed")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        result = svc.reject_action(session, action, "不合适")
        assert result.status == "rejected"
        assert result.rejection_reason == "不合适"


def test_reject_non_proposed_raises(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        aid = _create_action(session, status="executed")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        with pytest.raises(ValueError):
            svc.reject_action(session, action)


# ── revert_action ────────────────────────────────────────────

def test_revert_update_metadata(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session, title="旧标题", favorite=False)
        aid = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid,
                            after_values_json=json.dumps({"title": "新标题", "favorite": True}),
                            status="proposed")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)

        # First execute
        executed = svc.execute_action(session, action)
        assert executed.status == "executed"

        # Then revert
        # Re-fetch to get fresh after_values
        action2 = session.get(AgentAction, aid)
        reverted = svc.revert_action(session, action2)
        assert reverted.status == "reverted"
        assert reverted.revert_action_id == action2.id

        paper = session.get(Paper, pid)
        assert paper.title == "旧标题"
        assert paper.favorite is False

        # Original action should now be reverted
        action3 = session.get(AgentAction, aid)
        assert action3.status == "reverted"


def test_revert_stale_target_blocked(client):
    from app.services.agent_proposal_service import AgentProposalService
    from app.models.paper import Paper
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session, title="旧标题", favorite=False)
        aid = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid,
                            after_values_json=json.dumps({"title": "新标题", "favorite": True}),
                            status="proposed")["id"]
        from app.models.agent_action import AgentAction
        action = session.get(AgentAction, aid)
        executed = svc.execute_action(session, action)
        assert executed.status == "executed"

        # Manually change paper to make stale
        paper = session.get(Paper, pid)
        paper.title = "第三方修改"
        paper.favorite = False
        session.add(paper)
        session.commit()

        action2 = session.get(AgentAction, aid)
        with pytest.raises(ValueError) as excinfo:
            svc.revert_action(session, action2)
        assert "已被修改" in str(excinfo.value)


# ── batch_execute ────────────────────────────────────────────

def test_batch_execute_success(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        pid1 = _seed_paper(session, title="P1")
        pid2 = _seed_paper(session, title="P2")

        aid1 = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid1,
                             after_values_json=json.dumps({"title": "P1-new"}))["id"]
        aid2 = _create_action(session, action_type="update_paper_metadata", target_paper_id=pid2,
                             after_values_json=json.dumps({"title": "P2-new"}))["id"]

        from app.models.agent_action import AgentAction
        a1 = session.get(AgentAction, aid1)
        a2 = session.get(AgentAction, aid2)

        result = svc.batch_execute(session, [a1, a2])
        assert result["applied"] == 2
        assert result["failed"] == 0


def test_batch_execute_partial_failure(client):
    from app.services.agent_proposal_service import AgentProposalService
    svc = AgentProposalService()
    with Session(engine) as session:
        pid = _seed_paper(session, title="PGood")

        # Bad action: blocked type will fail validation
        aid_bad = _create_action(session, action_type="delete_paper",
                                target_paper_id=pid,
                                after_values_json=json.dumps({}))["id"]
        aid_good = _create_action(session, action_type="update_paper_metadata",
                                 target_paper_id=pid,
                                 after_values_json=json.dumps({"title": "good"}))["id"]

        from app.models.agent_action import AgentAction
        a_bad = session.get(AgentAction, aid_bad)
        a_good = session.get(AgentAction, aid_good)

        result = svc.batch_execute(session, [a_bad, a_good])
        assert result["applied"] == 1
        assert result["failed"] >= 1
