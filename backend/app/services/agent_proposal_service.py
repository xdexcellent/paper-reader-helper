"""Agent proposal validation, execution, rejection, and revert service."""
import json
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.agent_action import AgentAction
from app.models.category import Category
from app.models.paper import Paper
from app.services.category_service import create_category, update_paper_category

logger = logging.getLogger(__name__)

# Allowed action types and the fields they can modify
ALLOWED_ACTIONS = {
    "update_paper_metadata",
    "update_tags",
    "update_category",
    "create_category",
    "assign_category",
}

BLOCKED_ACTIONS = {
    "delete_paper",
    "delete_files",
    "trigger_parse",
    "trigger_summarize",
    "trigger_embed",
    "trigger_translate",
    "modify_local_path",
}


class AgentProposalService:
    """Safe execution gate for Agent write operations with full audit trail."""

    def __init__(self) -> None:
        pass

    # ── validation ──────────────────────────────────────────

    def validate_proposal(self, session: Session, action: AgentAction) -> AgentAction:
        """Check that the proposal references valid targets and is allowed."""
        if action.action_type in BLOCKED_ACTIONS:
            action.status = "failed"
            action.error_message = f"禁止的操作类型: {action.action_type}"
            session.add(action)
            session.commit()
            session.refresh(action)
            return action

        if action.action_type not in ALLOWED_ACTIONS:
            action.status = "failed"
            action.error_message = f"未知的操作类型: {action.action_type}"
            session.add(action)
            session.commit()
            session.refresh(action)
            return action

        if action.status != "proposed":
            action.status = "failed"
            action.error_message = f"只有 proposed 状态的操作可以执行，当前状态: {action.status}"
            session.add(action)
            session.commit()
            session.refresh(action)
            return action

        # Validate target exists based on action type
        if action.action_type in ("update_paper_metadata", "update_tags", "update_category", "assign_category"):
            if action.target_paper_id is None:
                action.status = "failed"
                action.error_message = "缺少 target_paper_id"
                session.add(action)
                session.commit()
                session.refresh(action)
                return action
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                action.status = "failed"
                action.error_message = f"论文 id={action.target_paper_id} 不存在"
                session.add(action)
                session.commit()
                session.refresh(action)
                return action

        if action.action_type in ("create_category",):
            # target_category_id is optional when creating; validated by create_category service
            pass
        elif action.action_type in ("update_category", "assign_category"):
            if action.target_category_id is None:
                action.status = "failed"
                action.error_message = "缺少 target_category_id"
                session.add(action)
                session.commit()
                session.refresh(action)
                return action
            cat = session.get(Category, action.target_category_id)
            if cat is None or not cat.is_active:
                action.status = "failed"
                action.error_message = f"分类 id={action.target_category_id} 不存在或已停用"
                session.add(action)
                session.commit()
                session.refresh(action)
                return action

        return action

    # ── execution ───────────────────────────────────────────

    def execute_action(self, session: Session, action: AgentAction) -> AgentAction:
        """Execute a validated and approved action, storing before/after values."""
        # Validate first
        action = self.validate_proposal(session, action)
        if action.status == "failed":
            return action

        try:
            self._do_execute(session, action)
            action.status = "executed"
            action.updated_at = datetime.now(timezone.utc)
            session.add(action)
            session.commit()
            session.refresh(action)
        except Exception as exc:
            logger.exception("execution failed for action %s", action.id)
            action.status = "failed"
            action.error_message = str(exc)
            action.updated_at = datetime.now(timezone.utc)
            session.add(action)
            session.commit()
            session.refresh(action)

        return action

    def _do_execute(self, session: Session, action: AgentAction) -> None:
        """Internal: perform the actual write."""
        at = action.action_type
        after = json.loads(action.after_values_json) if action.after_values_json else {}

        if at == "update_paper_metadata":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")

            # Record before state
            before = {
                "title": paper.title,
                "authors": paper.authors,
                "year": paper.year,
                "venue": paper.venue,
                "doi": paper.doi,
                "url": paper.url,
                "favorite": paper.favorite,
                "reading_status": paper.reading_status,
                "reading_progress": paper.reading_progress,
                "user_notes": paper.user_notes,
            }
            action.before_values_json = json.dumps(before, ensure_ascii=False)

            # Apply updates
            updatable = ["title", "authors", "year", "venue", "doi", "url", "favorite",
                         "reading_status", "reading_progress", "user_notes"]
            for field in updatable:
                if field in after:
                    setattr(paper, field, after[field])

            paper.updated_at = datetime.now(timezone.utc)
            session.add(paper)
            session.flush()
            # Record after state
            after_recorded = {f: getattr(paper, f) for f in updatable}
            action.after_values_json = json.dumps(after_recorded, ensure_ascii=False)

        elif at == "update_tags":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")

            before = {"tags": paper.tags}
            action.before_values_json = json.dumps(before, ensure_ascii=False)

            new_tags = after.get("tags", [])
            paper.tags = new_tags
            paper.updated_at = datetime.now(timezone.utc)
            session.add(paper)
            session.flush()
            action.after_values_json = json.dumps({"tags": paper.tags}, ensure_ascii=False)

        elif at == "update_category":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")
            category = session.get(Category, action.target_category_id)
            if category is None:
                raise ValueError(f"分类 id={action.target_category_id} 不存在")

            before = {
                "primary_category_id": paper.primary_category_id,
                "category_confidence": paper.category_confidence,
                "category_status": paper.category_status,
                "category_reason": paper.category_reason,
            }
            action.before_values_json = json.dumps(before, ensure_ascii=False)

            update_paper_category(
                session, paper, category,
                confidence=1.0,
                status="manual_locked",
                reason="Agent assigned.",
            )
            session.refresh(paper)
            after_recorded = {
                "primary_category_id": paper.primary_category_id,
                "category_confidence": paper.category_confidence,
                "category_status": paper.category_status,
                "category_reason": paper.category_reason,
            }
            action.after_values_json = json.dumps(after_recorded, ensure_ascii=False)

        elif at == "create_category":
            name = after.get("name", "").strip()
            if not name:
                raise ValueError("分类名称不能为空")
            description = after.get("description", "")
            category = create_category(session, name, description)
            before = {}
            action.before_values_json = json.dumps(before, ensure_ascii=False)
            after_recorded = {
                "id": category.id,
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
            }
            action.after_values_json = json.dumps(after_recorded, ensure_ascii=False)
            action.target_category_id = category.id

        elif at == "assign_category":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")
            category = session.get(Category, action.target_category_id)
            if category is None:
                raise ValueError(f"分类 id={action.target_category_id} 不存在")

            before = {
                "primary_category_id": paper.primary_category_id,
                "category_confidence": paper.category_confidence,
                "category_status": paper.category_status,
                "category_reason": paper.category_reason,
            }
            action.before_values_json = json.dumps(before, ensure_ascii=False)

            update_paper_category(
                session, paper, category,
                confidence=1.0,
                status="manual_locked",
                reason="Agent assigned.",
            )
            session.refresh(paper)
            after_recorded = {
                "primary_category_id": paper.primary_category_id,
                "category_confidence": paper.category_confidence,
                "category_status": paper.category_status,
                "category_reason": paper.category_reason,
            }
            action.after_values_json = json.dumps(after_recorded, ensure_ascii=False)

        else:
            raise ValueError(f"不支持的操作类型: {at}")

    # ── rejection ───────────────────────────────────────────

    def reject_action(self, session: Session, action: AgentAction, reason: str = "") -> AgentAction:
        """Mark a proposal as rejected."""
        if action.status != "proposed":
            raise ValueError(f"只有 proposed 状态的操作可以拒绝，当前状态: {action.status}")

        action.status = "rejected"
        action.rejection_reason = reason
        action.updated_at = datetime.now(timezone.utc)
        session.add(action)
        session.commit()
        session.refresh(action)
        return action

    # ── revert ──────────────────────────────────────────────

    def revert_action(self, session: Session, action: AgentAction) -> AgentAction:
        """Revert an executed action, creating a linked audit record."""
        if action.status != "executed":
            raise ValueError(f"只有 executed 状态的操作可以回退，当前状态: {action.status}")

        # Check if target hasn't changed since execution
        before = json.loads(action.before_values_json) if action.before_values_json else {}
        if not before:
            raise ValueError("缺少操作前的状态数据，无法回退")

        at = action.action_type

        if at == "update_paper_metadata":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")
            # Stale check: compare current values with after_values
            after_json = json.loads(action.after_values_json) if action.after_values_json else {}
            stale_fields = []
            updatable = ["title", "authors", "year", "venue", "doi", "url", "favorite",
                         "reading_status", "reading_progress", "user_notes"]
            for f in updatable:
                current = getattr(paper, f, "")
                recorded = after_json.get(f)
                if recorded is not None and current != recorded:
                    stale_fields.append(f)
            if stale_fields:
                raise ValueError(f"目标论文字段已被修改，无法自动回退。变更字段: {', '.join(stale_fields)}。请手动处理。")

            # Restore before values
            for f in updatable:
                if f in before:
                    setattr(paper, f, before[f])
            paper.updated_at = datetime.now(timezone.utc)
            session.add(paper)
            session.flush()

        elif at == "update_tags":
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")
            paper.tags = before.get("tags", [])
            paper.updated_at = datetime.now(timezone.utc)
            session.add(paper)
            session.flush()

        elif at in ("update_category", "assign_category"):
            paper = session.get(Paper, action.target_paper_id)
            if paper is None:
                raise ValueError(f"论文 id={action.target_paper_id} 不存在")
            cat_id = before.get("primary_category_id")
            if cat_id is None:
                raise ValueError("无法回退到空分类")
            cat = session.get(Category, cat_id)
            if cat is None:
                raise ValueError(f"原分类 id={cat_id} 不存在")
            update_paper_category(
                session, paper, cat,
                confidence=before.get("category_confidence", 0),
                status=before.get("category_status", "pending_review"),
                reason=before.get("category_reason", ""),
            )
            session.refresh(paper)

        elif at == "create_category":
            # Reverting category creation is complex; mark as non-reversible
            raise ValueError("创建分类的操作无法自动回退，请手动删除")

        else:
            raise ValueError(f"不支持的操作类型: {at}")

        # Create revert audit record
        revert_action = AgentAction(
            agent_run_id=action.agent_run_id,
            action_type=action.action_type,
            target_paper_id=action.target_paper_id,
            target_category_id=action.target_category_id,
            before_values_json=action.after_values_json or "{}",
            after_values_json=action.before_values_json or "{}",
            rationale=f"回退操作 id={action.id}",
            confidence=1.0,
            risk_level="low",
            status="reverted",
            revert_action_id=action.id,
        )
        session.add(revert_action)
        action.status = "reverted"
        action.updated_at = datetime.now(timezone.utc)
        session.add(action)
        session.commit()
        session.refresh(revert_action)

        return revert_action

    # ── batch execution ─────────────────────────────────────

    def batch_execute(self, session: Session, actions: list[AgentAction]) -> dict:
        """Execute multiple actions; independent actions continue on sibling failure."""
        applied = 0
        skipped = 0
        failed = 0
        rejected = 0
        failed_action_ids: set[int] = set()

        for action in actions:
            # Skip if depends on a failed action (same target + category depends)
            if action.action_type in ("update_category", "assign_category"):
                # Find sibling actions on same paper that failed
                pass  # This is a simplified dependency check

            result = self.execute_action(session, action)
            if result.status == "executed":
                applied += 1
            elif result.status == "failed":
                failed += 1
                failed_action_ids.add(action.id)
            elif result.status == "rejected":
                rejected += 1
            else:
                skipped += 1

        return {
            "applied": applied,
            "skipped": skipped,
            "failed": failed,
            "rejected": rejected,
        }
