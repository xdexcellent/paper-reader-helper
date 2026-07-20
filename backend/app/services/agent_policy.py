"""Shared policy helpers for Agent proposal safety and risk mapping."""

from __future__ import annotations

import re
from typing import Any, Mapping

CORE_METADATA_FIELDS = {"title", "authors", "year", "venue", "doi", "url"}
LOW_RISK_METADATA_FIELDS = {"favorite", "reading_status", "reading_progress", "user_notes"}

# 必须同时出现“纠错/补全”类意图与书目/元数据对象，避免“补全标签/修正分类”误放行。
_METADATA_INTENT_RE = re.compile(
    r"(纠错|修正|更正).{0,24}(元数据|metadata|书目|doi|标题|作者|年份|venue|url|title|author|year)|"
    r"(补全|补充|修复).{0,24}(元数据|metadata|书目|doi|标题|作者|年份|venue|url)|"
    r"(元数据|书目信息|metadata).{0,12}(纠错|修正|更正|补全|补充|修复|correct|fix|complete)|"
    r"(fix|correct|repair|complete|fill in).{0,24}(metadata|bibliographic|doi|title|author|year|venue|url)",
    re.IGNORECASE,
)


def prompt_requests_metadata_correction(prompt: str) -> bool:
    """Return True when the user explicitly asks to correct or complete metadata."""
    if not prompt:
        return False
    return _METADATA_INTENT_RE.search(prompt) is not None


def sanitize_metadata_updates(
    after_values: Mapping[str, Any],
    *,
    allow_core_metadata: bool,
) -> dict[str, Any]:
    """Keep only supported metadata keys and gate core bibliographic fields."""
    sanitized: dict[str, Any] = {}
    for key, value in after_values.items():
        if key in CORE_METADATA_FIELDS:
            if allow_core_metadata:
                sanitized[key] = value
            continue
        if key in LOW_RISK_METADATA_FIELDS:
            sanitized[key] = value
    return sanitized


def classify_action_risk(action_type: str, after_values: Mapping[str, Any] | None = None) -> str:
    """Map action types to product risk tiers for approval controls."""
    if action_type == "create_category":
        return "high"
    if action_type in {"update_category", "assign_category"}:
        return "medium"
    if action_type == "update_paper_metadata":
        keys = set((after_values or {}).keys())
        return "high" if keys & CORE_METADATA_FIELDS else "low"
    return "low"


def is_batch_approvable_risk(risk_level: str) -> bool:
    """Only low-risk proposals may be batch approved."""
    return risk_level == "low"
