"""Agent API routes — run creation, listing, proposal approval, rejection, revert."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.agent_action import AgentAction
from app.models.agent_run import AgentRun
from app.models.agent_tool_event import AgentToolEvent
from app.schemas.agent import (
    AgentActionResponse,
    AgentRunCreate,
    AgentRunResponse,
    AgentScopeConfig,
    AgentToolEventResponse,
    BatchApproveRequest,
    BatchApproveResponse,
    RejectRequest,
)
from app.services.agent_proposal_service import AgentProposalService
from app.services.agent_runner_service import AgentRunnerService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


# ── helpers ──────────────────────────────────────────────────

def _action_to_response(action: AgentAction) -> AgentActionResponse:
    before = {}
    after = {}
    try:
        before = json.loads(action.before_values_json) if action.before_values_json else {}
    except json.JSONDecodeError:
        pass
    try:
        after = json.loads(action.after_values_json) if action.after_values_json else {}
    except json.JSONDecodeError:
        pass

    return AgentActionResponse(
        id=action.id,
        agent_run_id=action.agent_run_id,
        action_type=action.action_type,
        target_paper_id=action.target_paper_id,
        target_category_id=action.target_category_id,
        before_values=before,
        after_values=after,
        rationale=action.rationale,
        confidence=action.confidence,
        risk_level=action.risk_level,
        status=action.status,
        revert_action_id=action.revert_action_id,
        rejection_reason=action.rejection_reason,
        error_message=action.error_message,
    )


def _tool_event_to_response(event: AgentToolEvent) -> AgentToolEventResponse:
    return AgentToolEventResponse(
        id=event.id,
        tool_name=event.tool_name,
        input_summary=event.input_summary,
        output_summary=event.output_summary,
        status=event.status,
        error_message=event.error_message or "",
    )


def _run_to_response(run: AgentRun, session: Session) -> AgentRunResponse:
    scope_config = {}
    try:
        scope_config = json.loads(run.scope_config_json) if run.scope_config_json else {}
    except json.JSONDecodeError:
        pass

    actions = list(session.exec(
        select(AgentAction).where(AgentAction.agent_run_id == run.id).order_by(AgentAction.id)
    ).all())

    tool_events = list(session.exec(
        select(AgentToolEvent).where(AgentToolEvent.agent_run_id == run.id).order_by(AgentToolEvent.id)
    ).all())

    return AgentRunResponse(
        id=run.id,
        prompt=run.prompt,
        scope=AgentScopeConfig(
            scope_type=run.scope_type,
            category_id=scope_config.get("category_id"),
            paper_ids=scope_config.get("paper_ids", []),
        ),
        model=run.model,
        status=run.status,
        chat_session_id=run.chat_session_id,
        actions=[_action_to_response(a) for a in actions],
        tool_events=[_tool_event_to_response(e) for e in tool_events],
        created_at=run.created_at.isoformat() if run.created_at else "",
        updated_at=run.updated_at.isoformat() if run.updated_at else "",
    )


# ── run endpoints ───────────────────────────────────────────

@router.post("/runs", response_model=AgentRunResponse, status_code=201)
def create_agent_run(
    payload: AgentRunCreate,
    session: Session = Depends(get_session),
) -> AgentRunResponse:
    """Create a new Agent run with prompt and scope. Executes synchronously."""
    runner = AgentRunnerService()

    scope_config = {
        "category_id": payload.scope.category_id,
        "paper_ids": payload.scope.paper_ids,
    }
    run = runner.create_run(
        session,
        prompt=payload.prompt,
        scope_type=payload.scope.scope_type,
        scope_config=scope_config,
        model=payload.model,
        chat_session_id=payload.chat_session_id,
    )

    # Execute synchronously (pass thinking mode)
    runner.execute_run(session, run, thinking=payload.thinking or None)

    # Refresh run to get updated status
    session.refresh(run)
    return _run_to_response(run, session)


@router.get("/runs", response_model=list[AgentRunResponse])
def list_agent_runs(
    session: Session = Depends(get_session),
) -> list[AgentRunResponse]:
    """List recent Agent runs (last 20, ordered by created_at desc)."""
    runs = list(session.exec(
        select(AgentRun).order_by(AgentRun.created_at.desc()).limit(20)
    ).all())
    return [_run_to_response(run, session) for run in runs]


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
def get_agent_run(
    run_id: int,
    session: Session = Depends(get_session),
) -> AgentRunResponse:
    """Get Agent run detail with actions and tool events."""
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Agent 运行记录不存在")
    return _run_to_response(run, session)


# ── action endpoints ─────────────────────────────────────────

@router.post("/actions/{action_id}/approve", response_model=AgentActionResponse)
def approve_agent_action(
    action_id: int,
    session: Session = Depends(get_session),
) -> AgentActionResponse:
    """Approve and execute a single proposed action."""
    action = session.get(AgentAction, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="操作建议不存在")

    svc = AgentProposalService()
    try:
        result = svc.execute_action(session, action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _action_to_response(result)


@router.post("/runs/{run_id}/approve-batch", response_model=BatchApproveResponse)
def batch_approve_actions(
    run_id: int,
    payload: BatchApproveRequest,
    session: Session = Depends(get_session),
) -> BatchApproveResponse:
    """Batch approve multiple proposed actions for a run."""
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Agent 运行记录不存在")

    if not payload.action_ids:
        raise HTTPException(status_code=400, detail="请选择要执行的操作")

    actions: list[AgentAction] = []
    for aid in payload.action_ids:
        action = session.get(AgentAction, aid)
        if action is None:
            raise HTTPException(status_code=404, detail=f"操作建议 id={aid} 不存在")
        if action.agent_run_id != run_id:
            raise HTTPException(status_code=400, detail=f"操作建议 id={aid} 不属于该运行")
        if action.status != "proposed":
            continue  # skip already processed actions
        actions.append(action)

    if not actions:
        return BatchApproveResponse(applied=0, skipped=0, failed=0, rejected=0)

    svc = AgentProposalService()
    result = svc.batch_execute(session, actions)
    return BatchApproveResponse(**result)


@router.post("/actions/{action_id}/reject", response_model=AgentActionResponse)
def reject_agent_action(
    action_id: int,
    payload: RejectRequest = RejectRequest(),
    session: Session = Depends(get_session),
) -> AgentActionResponse:
    """Reject a proposed action with optional reason."""
    action = session.get(AgentAction, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="操作建议不存在")

    svc = AgentProposalService()
    try:
        result = svc.reject_action(session, action, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _action_to_response(result)


@router.post("/actions/{action_id}/revert", response_model=AgentActionResponse)
def revert_agent_action(
    action_id: int,
    session: Session = Depends(get_session),
) -> AgentActionResponse:
    """Revert an executed action."""
    action = session.get(AgentAction, action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="操作建议不存在")

    svc = AgentProposalService()
    try:
        result = svc.revert_action(session, action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _action_to_response(result)
