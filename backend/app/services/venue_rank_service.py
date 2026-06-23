from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.models.paper import Paper

logger = logging.getLogger(__name__)

# backend/app/data — 内置 CCF 数据（随仓库分发，公开可引用）
_BUILTIN_DIR = Path(__file__).resolve().parent.parent / "data"
_CCF_FILE = _BUILTIN_DIR / "venue_ranks_ccf.json"
_SCI_IF_EXAMPLE_FILE = _BUILTIN_DIR / "venue_ranks_sci_if.example.json"

# <root>/data/rank_data — 本地 SCI/IF 数据（不随仓库分发，规避版权）
_LOCAL_DIR = Path(__file__).resolve().parents[3] / "data" / "rank_data"
_SCI_IF_LOCAL_FILE = _LOCAL_DIR / "venue_ranks_sci_if.json"


@dataclass(frozen=True)
class RankMatch:
    ccf: str
    sci_zone: str
    impact_factor: str


_rank_index: Optional[dict[str, RankMatch]] = None


def _normalize_venue(venue: str) -> str:
    """归一化 venue：小写 → 仅保留字母数字与空格 → 折叠多空格 → strip。"""
    if not venue:
        return ""
    lowered = venue.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


# 清洗 venue 去掉年份和类型后缀词，例: "NeurIPS 2025 poster" -> "NeurIPS"
_VENUE_SUFFIX_RE = re.compile(
    r"\b(20\d{2}|19\d{2})\b"
    r"|\b(poster|spotlight|oral|conference|workshop|proceedings|main|track|poster session)\b",
    re.IGNORECASE,
)


def _clean_venue(venue: str) -> str:
    """清洗 venue：去掉年份/类型词/尾部括号，保留核心会议/期刊名。"""
    if not venue:
        return ""
    v = _VENUE_SUFFIX_RE.sub(" ", venue)
    v = re.sub(r"\s*\([^)]*\)\s*$", "", v).strip()
    v = re.sub(r"\s+", " ", v).strip()
    return v


def _load_json_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        logger.warning("Rank data file %s is not a list, ignored.", path)
        return []
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load rank data file %s: %s", path, exc)
        return []


def _index_entry(raw: dict) -> RankMatch:
    return RankMatch(
        ccf=str(raw.get("ccf", "") or "").strip(),
        sci_zone=str(raw.get("sci_zone", "") or "").strip(),
        impact_factor=str(raw.get("impact_factor", "") or "").strip(),
    )


def _register(index: dict[str, RankMatch], raw: dict, source: str) -> None:
    """把一条记录的 venue + 所有 aliases 归一化后写入索引（后写覆盖先写，本地优先于内置）。"""
    entry = _index_entry(raw)
    keys: list[str] = []
    venue = str(raw.get("venue", "") or "").strip()
    if venue:
        keys.append(venue)
    aliases = raw.get("aliases") or []
    if isinstance(aliases, list):
        keys.extend(str(a).strip() for a in aliases if str(a).strip())
    for key in keys:
        norm = _normalize_venue(key)
        if norm:
            index[norm] = entry
    if not keys:
        logger.debug("Skip rank entry without venue in %s: %r", source, raw)


def load_rank_index(force: bool = False) -> dict[str, RankMatch]:
    """加载并合并内置 CCF + 本地 SCI/IF，构建归一化 venue→RankMatch 索引。模块级缓存。"""
    global _rank_index
    if _rank_index is not None and not force:
        return _rank_index

    index: dict[str, RankMatch] = {}

    for raw in _load_json_file(_CCF_FILE):
        _register(index, raw, str(_CCF_FILE))

    # 本地 SCI/IF 后加载，覆盖内置同 venue 记录（本地优先）
    local_entries = _load_json_file(_SCI_IF_LOCAL_FILE)
    if local_entries:
        for raw in local_entries:
            _register(index, raw, str(_SCI_IF_LOCAL_FILE))
    elif not _SCI_IF_LOCAL_FILE.exists():
        logger.info(
            "Local SCI/IF rank file not found at %s. "
            "Copy %s to it to enable SCI/IF matching.",
            _SCI_IF_LOCAL_FILE,
            _SCI_IF_EXAMPLE_FILE,
        )

    _rank_index = index
    logger.info("Venue rank index loaded: %d entries.", len(index))
    return index


def match_rank(venue: str) -> Optional[RankMatch]:
    """venue 归一化精确匹配等级；未命中则清洗后缀(年份/类型词)重试；仍未命中返回 None。"""
    if not venue:
        return None
    index = load_rank_index()
    norm = _normalize_venue(venue)
    if not norm:
        return None
    match = index.get(norm)
    if match is not None:
        return match
    # 清洗后缀重试：如 "NeurIPS 2025 poster" -> "NeurIPS"
    cleaned = _clean_venue(venue)
    if cleaned and cleaned != venue:
        norm2 = _normalize_venue(cleaned)
        if norm2 and norm2 != norm:
            return index.get(norm2)
    return None


def apply_system_rank(paper: "Paper") -> bool:
    """根据 paper.venue 匹配等级并写入系统列（ccf_rank/sci_zone/impact_factor）。

    不触碰 *_override 列。返回是否发生变更。
    """
    match = match_rank(paper.venue)
    ccf = match.ccf if match else ""
    sci = match.sci_zone if match else ""
    ifac = match.impact_factor if match else ""

    changed = (
        paper.ccf_rank != ccf
        or paper.sci_zone != sci
        or paper.impact_factor != ifac
    )
    if changed:
        paper.ccf_rank = ccf
        paper.sci_zone = sci
        paper.impact_factor = ifac
    return changed
