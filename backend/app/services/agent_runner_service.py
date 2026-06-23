"""Agent runner service — composes system prompt, calls model, parses proposals."""
import json
import logging
import re
from datetime import datetime, timezone

from sqlmodel import Session

from app.models.agent_action import AgentAction
from app.models.agent_run import AgentRun
from app.models.agent_tool_event import AgentToolEvent
from app.services.agent_tool_registry import AgentToolRegistry
from app.services.deepseek_client import DeepSeekClient

logger = logging.getLogger(__name__)

AGENT_SYSTEM_ROLE = (
    "你是一个专业的论文库管理助手。请根据用户的要求分析论文库并输出结构化的操作建议。\n\n"
    "可用的操作类型（action_type）：\n"
    "- update_paper_metadata: 更新论文元数据（title, authors, year, venue, doi, url, favorite, reading_status, reading_progress, user_notes）\n"
    "- update_tags: 更新论文标签\n"
    "- update_category: 更新论文的一级分类\n"
    "- create_category: 创建新的非系统分类\n"
    "- assign_category: 将论文分配到已有分类\n\n"
    "输出格式要求：\n"
    '请以 JSON 格式返回，包含 "actions" 数组。每个 action 包含以下字段：\n'
    '- action_type: 操作类型（以上5种之一）\n'
    '- target_paper_id: 目标论文ID（update_paper_metadata/update_tags/update_category/assign_category 时必填）\n'
    '- target_category_id: 目标分类ID（update_category/assign_category 时必填）\n'
    '- after_values: 变更后的值（JSON对象），例如 {"title": "新标题", "favorite": true}\n'
    '- rationale: 操作理由（50字以内的中文说明）\n'
    '- confidence: 置信度（0.0-1.0）\n'
    '- risk_level: 风险等级（low/medium/high）\n\n'
    "重要规则：\n"
    "1. 不要建议删除论文、删除文件或修改本地文件路径。\n"
    "2. 不要建议触发论文解析、摘要生成或翻译等后台任务。\n"
    "3. 只建议修改已有数据，不要编造论文ID。\n"
    "4. 创建新分类时，分类名称不能与已有分类重复。\n"
    "5. 仅返回 JSON，不要包含 markdown 标记、解释或其他文本。\n"
)


class AgentRunnerService:
    """Composes Agent prompt, calls the model, and parses structured proposals."""

    def __init__(self) -> None:
        self.tools = AgentToolRegistry()
        self.client = DeepSeekClient()

    def create_run(
        self,
        session: Session,
        prompt: str,
        scope_type: str,
        scope_config: dict | None = None,
        model: str | None = None,
        chat_session_id: int | None = None,
    ) -> AgentRun:
        """Create a new AgentRun record."""
        resolved_model = self.client.resolve_model(model)
        run = AgentRun(
            prompt=prompt,
            scope_type=scope_type,
            scope_config_json=json.dumps(scope_config or {}, ensure_ascii=False),
            model=resolved_model,
            status="pending",
            chat_session_id=chat_session_id,
        )
        session.add(run)
        session.commit()
        session.refresh(run)
        return run

    def execute_run(self, session: Session, run: AgentRun, thinking: str | None = None) -> list[AgentAction]:
        """Execute an Agent run: collect library context, call model, parse proposals."""
        run.status = "running"
        run.updated_at = datetime.now(timezone.utc)
        session.add(run)
        session.commit()
        session.refresh(run)

        tool_events: list[AgentToolEvent] = []
        scope_config = {}
        try:
            scope_config = json.loads(run.scope_config_json) if run.scope_config_json else {}
        except json.JSONDecodeError:
            pass

        try:
            # 1. Collect library context via read-only tools
            library_context_parts: list[str] = []

            # Paper listing
            paper_result = self.tools.list_papers(session, run.scope_type, scope_config)
            self._record_tool_event(session, run.id, "list_papers", paper_result, tool_events)
            if paper_result.get("data"):
                library_context_parts.append(f"## 论文库概览\n{json.dumps(paper_result['data'], ensure_ascii=False, indent=2)}")

            # Categories
            cat_result = self.tools.list_categories(session)
            self._record_tool_event(session, run.id, "list_categories", cat_result, tool_events)
            if cat_result.get("data"):
                library_context_parts.append(f"## 分类目录\n{json.dumps(cat_result['data'], ensure_ascii=False, indent=2)}")

            # Tags
            tag_result = self.tools.list_tags(session)
            self._record_tool_event(session, run.id, "list_tags", tag_result, tool_events)
            if tag_result.get("data"):
                library_context_parts.append(f"## 现有标签\n{json.dumps(tag_result['data'], ensure_ascii=False)}")

            # If scope is a single paper, include detail + blocks + translations
            if run.scope_type == "reader_paper" and scope_config.get("paper_id"):
                pid = scope_config["paper_id"]
                detail_result = self.tools.get_paper_detail(session, pid)
                self._record_tool_event(session, run.id, "get_paper_detail", detail_result, tool_events)
                if detail_result.get("data"):
                    library_context_parts.append(f"## 论文详情\n{json.dumps(detail_result['data'], ensure_ascii=False, indent=2)}")

                blocks_result = self.tools.get_paper_blocks(session, pid)
                self._record_tool_event(session, run.id, "get_paper_blocks", blocks_result, tool_events)

                trans_result = self.tools.get_paper_translations(session, pid)
                self._record_tool_event(session, run.id, "get_paper_translations", trans_result, tool_events)

            # 2. Composed library context
            library_context = "\n\n".join(library_context_parts)

            # 3. Build system prompt (server-composed, never from frontend)
            system_prompt = self._build_system_prompt(library_context)

            # 4. Call model
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": run.prompt},
            ]
            response_text = self.client.chat(messages, model=run.model, thinking=thinking)

            if "API Key 未配置" in response_text:
                raise RuntimeError(response_text)

            # 5. Parse response for proposals
            actions = self._parse_response(session, run.id, response_text)

            run.status = "completed"
            run.updated_at = datetime.now(timezone.utc)
            session.add(run)
            session.commit()
            session.refresh(run)

            return actions

        except Exception as exc:
            logger.exception("Agent run %s failed", run.id)
            # Record a terminal error event so the frontend can explain what went wrong.
            error_event = AgentToolEvent(
                agent_run_id=run.id,
                tool_name="agent_runner",
                input_summary="execute_run",
                output_summary="",
                status="error",
                error_message=str(exc)[:500] or exc.__class__.__name__,
            )
            session.add(error_event)
            run.status = "failed"
            run.updated_at = datetime.now(timezone.utc)
            session.add(run)
            session.commit()
            session.refresh(run)
            # No actions on failure
            return []

    def _record_tool_event(
        self,
        session: Session,
        run_id: int,
        tool_name: str,
        result: dict,
        events: list[AgentToolEvent],
    ) -> None:
        """Record a tool call as an AgentToolEvent."""
        input_summary = f"tool={tool_name}"
        output_summary = ""
        if result.get("data") is not None:
            data_str = json.dumps(result["data"], ensure_ascii=False)
            output_summary = data_str[:500] + ("…" if len(data_str) > 500 else "")
        elif result.get("error"):
            output_summary = f"error: {result['error']}"[:500]

        event = AgentToolEvent(
            agent_run_id=run_id,
            tool_name=tool_name,
            input_summary=input_summary,
            output_summary=output_summary,
            status="error" if result.get("error") else "success",
            error_message=result.get("error", ""),
        )
        session.add(event)
        session.commit()
        events.append(event)

    def _build_system_prompt(self, library_context: str) -> str:
        """Compose the full system prompt with role, library context, and tool results."""
        parts = [AGENT_SYSTEM_ROLE]
        if library_context:
            parts.append(f"## 当前论文库信息\n{library_context}")
        return "\n\n".join(parts)

    def _parse_response(self, session: Session, run_id: int, response_text: str) -> list[AgentAction]:
        """Extract structured proposals from model response JSON."""
        actions: list[AgentAction] = []

        # Try to extract JSON from response
        json_str = response_text

        # Remove markdown code fences if present
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
        if fence_match:
            json_str = fence_match.group(1).strip()

        # Try to find a JSON object
        obj_match = re.search(r"\{[\s\S]*\}", json_str)
        if obj_match:
            json_str = obj_match.group(0)

        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError:
            # Try repair: add closing braces if truncated
            try:
                if json_str.count("{") > json_str.count("}"):
                    json_str += "}" * (json_str.count("{") - json_str.count("}"))
                parsed = json.loads(json_str)
            except json.JSONDecodeError:
                logger.warning("Failed to parse model response for run %s", run_id)
                raise RuntimeError("Agent 返回了无法解析的建议，请重试。")

        raw_actions = parsed.get("actions", [])
        if isinstance(parsed, list):
            raw_actions = parsed
        if not isinstance(raw_actions, list):
            raise RuntimeError("Agent 返回格式不正确，缺少 actions 数组。")

        for raw in raw_actions:
            try:
                action_type = str(raw.get("action_type", "")).strip()
                if action_type not in {
                    "update_paper_metadata", "update_tags", "update_category",
                    "create_category", "assign_category",
                }:
                    logger.warning("Skipping unknown action_type: %s", action_type)
                    continue

                after_values = raw.get("after_values", {})
                if not isinstance(after_values, dict):
                    after_values = {}

                action = AgentAction(
                    agent_run_id=run_id,
                    action_type=action_type,
                    target_paper_id=raw.get("target_paper_id"),
                    target_category_id=raw.get("target_category_id"),
                    after_values_json=json.dumps(after_values, ensure_ascii=False),
                    rationale=str(raw.get("rationale", ""))[:200],
                    confidence=float(raw.get("confidence", 0.5)),
                    risk_level=str(raw.get("risk_level", "low")),
                    status="proposed",
                )
                session.add(action)
                session.commit()
                session.refresh(action)
                actions.append(action)
            except (TypeError, ValueError) as exc:
                logger.warning("Skipping malformed action in run %s: %s", run_id, exc)
                continue

        return actions
