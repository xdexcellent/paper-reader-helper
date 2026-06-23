import json
import logging

from sqlmodel import Session

from app.models.paper import CategoryStatus, Paper
from app.models.paper_summary import PaperSummary
from app.services.category_service import get_category_aliases, get_pending_category, list_categories, normalize_alias
from app.services.deepseek_client import DeepSeekClient

logger = logging.getLogger(__name__)


class CategoryClassifier:
    def __init__(self, deepseek_client: DeepSeekClient | None = None) -> None:
        self.deepseek_client = deepseek_client or DeepSeekClient()

    def classify(self, session: Session, paper: Paper, summary: PaperSummary) -> dict[str, object]:
        categories = [category for category in list_categories(session, active_only=True) if not category.is_pending_bucket]
        pending = get_pending_category(session)
        if not categories:
            return {
                "primary_category_id": pending.id,
                "confidence": 0.0,
                "status": CategoryStatus.PENDING_REVIEW,
                "reason": "No active controlled categories were available.",
            }

        scored_matches = self._score_categories(session, categories, paper, summary)
        if scored_matches:
            best_category, best_matches = scored_matches[0]
            confidence = self._confidence_from_matches(len(best_matches))
            if confidence >= 0.7:
                return {
                    "primary_category_id": best_category.id,
                    "confidence": round(confidence, 2),
                    "status": CategoryStatus.AUTO_CONFIRMED,
                    "reason": f"Heuristic match on aliases: {', '.join(best_matches[:3])}",
                }
            return {
                "primary_category_id": pending.id,
                "confidence": round(confidence, 2),
                "status": CategoryStatus.PENDING_REVIEW,
                "reason": f"Low-confidence heuristic match: {', '.join(best_matches[:3])}",
            }

        return {
            "primary_category_id": pending.id,
            "confidence": 0.0,
            "status": CategoryStatus.PENDING_REVIEW,
            "reason": "No strong category signals were found.",
        }

    def suggest_tags(
        self,
        session: Session,
        paper: Paper,
        summary: PaperSummary,
        *,
        max_tags: int = 4,
    ) -> list[str]:
        categories = [category for category in list_categories(session, active_only=True) if not category.is_pending_bucket]
        scored_matches = self._score_categories(session, categories, paper, summary)
        if not scored_matches:
            return []
        return [category.name for category, _matches in scored_matches[:max_tags]]

    def _classify_via_model(
        self,
        session: Session,
        categories: list,
        paper: Paper,
        summary: PaperSummary,
    ) -> dict[str, object] | None:
        alias_map = get_category_aliases(session, [category.id for category in categories])
        category_lines = []
        valid_ids = {category.id for category in categories}

        for category in categories:
            aliases = ", ".join(alias_map.get(category.id, []))
            category_lines.append(
                f'{category.id}: {category.name} | 描述: {category.description} | 别名: {aliases or "无"}'
            )

        prompt = (
            "你是论文分类助手。只能从给定目录中选择一个主分类，不允许自造目录。\n"
            "请基于论文标题、摘要和标签，返回 JSON 对象："
            '{"primary_category_id": 目录ID或null, "confidence": 0到1的小数, "reason": "一句话说明"}。\n'
            "如果不确定，可以返回较低 confidence。\n\n"
            f"候选目录:\n{chr(10).join(category_lines)}\n\n"
            f"标题: {paper.title}\n"
            f"一句话摘要: {summary.one_line_summary}\n"
            f"核心贡献: {summary.core_contributions[:240]}\n"
            f"方法概述: {summary.method_summary[:240]}\n"
            f"已有标签: {', '.join(paper.tags) if paper.tags else '无'}\n"
        )

        try:
            reply = self.deepseek_client.chat([{"role": "user", "content": prompt}])
            start = reply.find("{")
            end = reply.rfind("}") + 1
            if start == -1 or end <= 0:
                return None
            payload = json.loads(reply[start:end])
            category_id = payload.get("primary_category_id")
            confidence = float(payload.get("confidence", 0.0))
            reason = str(payload.get("reason", "")).strip()
            if category_id not in valid_ids:
                return None
            return {
                "primary_category_id": category_id,
                "confidence": round(confidence, 2),
                "status": CategoryStatus.AUTO_CONFIRMED,
                "reason": reason or "Selected from controlled category directory.",
            }
        except Exception:
            logger.warning("AI category classification failed for paper %s", paper.id, exc_info=True)
            return None

    def _score_categories(
        self,
        session: Session,
        categories: list,
        paper: Paper,
        summary: PaperSummary,
    ) -> list[tuple[object, list[str]]]:
        alias_map = get_category_aliases(session, [category.id for category in categories])
        text = " ".join(
            [
                paper.title,
                summary.one_line_summary,
                summary.core_contributions,
                summary.method_summary,
                " ".join(paper.tags),
            ]
        )
        normalized_text = normalize_alias(text)
        scored_matches: list[tuple[object, list[str]]] = []

        for category in categories:
            matches: list[str] = []
            aliases = [category.name, *alias_map.get(category.id, [])]
            seen_aliases: set[str] = set()
            for alias in aliases:
                normalized_alias = normalize_alias(alias)
                if not normalized_alias or normalized_alias in seen_aliases:
                    continue
                seen_aliases.add(normalized_alias)
                if normalized_alias in normalized_text:
                    matches.append(alias)
            if matches:
                scored_matches.append((category, matches))

        scored_matches.sort(key=lambda item: (len(item[1]), -item[0].sort_order), reverse=True)
        return scored_matches

    def _confidence_from_matches(self, match_count: int) -> float:
        if match_count >= 3:
            return 0.9
        if match_count == 2:
            return 0.8
        if match_count == 1:
            return 0.65
        return 0.0
