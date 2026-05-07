from __future__ import annotations

import hashlib
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block import PaperBlockType
from app.models.paper_block_translation import PaperBlockTranslation
from app.models.paper_content import PaperContent


MAX_SOURCE_JSON_CHARS = 4000
_TRUNCATION_SUFFIX = "...<truncated>"
_ZIP_JSON_PRIORITIES = (
    "content_list_v2",
    "content_list",
    "middle",
    "model",
)
_TEXT_KEYS = ("text", "content", "title_content", "paragraph_content", "math_content", "image_caption", "image_footnote", "table_caption", "table_body", "table_footnote", "chart_caption", "chart_footnote", "code_body", "code_caption", "code_footnote", "algorithm_content", "algorithm_caption", "algorithm_footnote", "list_items", "blocks", "lines", "spans")
_TYPE_ALIASES = {
    PaperBlockType.TITLE: {"doc_title", "title"},
    PaperBlockType.TEXT: {"paragraph", "text"},
    PaperBlockType.TABLE: {"table", "table_body", "table_caption", "table_footnote"},
    PaperBlockType.IMAGE: {"image", "image_body", "image_caption", "image_footnote"},
    PaperBlockType.CHART: {"chart", "chart_body", "chart_caption", "chart_footnote"},
    PaperBlockType.FORMULA: {"equation", "equation_interline", "interline_equation", "inline_equation"},
    PaperBlockType.LIST: {"list", "index", "ref_text"},
    PaperBlockType.CODE: {"code", "code_body", "code_caption", "algorithm"},
}


@dataclass(frozen=True)
class BlockCandidate:
    page_index: int | None
    block_index: int
    block_type: str
    text: str
    bbox: list[float] | None
    source_json: str
    source_hash: str


@dataclass(frozen=True)
class BlockRebuildResult:
    paper_id: int; block_count: int; has_blocks: bool


class BlockExtractionService:
    """Normalize local MinerU structured artifacts into pure block candidates."""

    def extract_from_parse_result(self, parse_result: dict[str, str]) -> list[BlockCandidate]:
        zip_path = _local_existing_path(parse_result.get("full_zip_path", ""))
        if zip_path is not None:
            candidates = self.extract_from_zip(zip_path)
            if candidates:
                return candidates

        json_path = _local_existing_path(parse_result.get("content_json_path", ""))
        if json_path is not None:
            return self.extract_from_json_file(json_path)

        return []

    def extract_from_json_file(self, path: str | Path) -> list[BlockCandidate]:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return self.extract_from_json(payload)

    def extract_from_zip(self, path: str | Path) -> list[BlockCandidate]:
        with zipfile.ZipFile(path) as archive:
            for name in sorted(_json_names(archive), key=_zip_priority):
                try:
                    payload = json.loads(archive.read(name).decode("utf-8"))
                except (KeyError, UnicodeDecodeError, json.JSONDecodeError):
                    continue
                candidates = self.extract_from_json(payload)
                if candidates:
                    return candidates
        return []

    def extract_from_json(self, payload: Any) -> list[BlockCandidate]:
        candidates: list[BlockCandidate] = []
        for entry, page_hint in _iter_entries(payload):
            candidate = _normalize_entry(entry, page_hint, len(candidates))
            if candidate is not None:
                candidates.append(candidate)
        return candidates

    def rebuild_blocks(
        self, session: Session, paper: Paper, content: PaperContent
    ) -> BlockRebuildResult:
        candidates = self.extract_from_parse_result({
            "content_json_path": content.content_json_path,
            "full_zip_path": content.full_zip_path,
        })
        block_count = self.replace_blocks(session, paper.id, candidates)
        return BlockRebuildResult(paper_id=paper.id, block_count=block_count, has_blocks=block_count > 0)

    def replace_blocks(
        self, session: Session, paper_id: int, candidates: list[BlockCandidate]
    ) -> int:
        for translation in session.exec(select(PaperBlockTranslation).where(PaperBlockTranslation.paper_id == paper_id)).all():
            session.delete(translation)
        for block in session.exec(select(PaperBlock).where(PaperBlock.paper_id == paper_id)).all():
            session.delete(block)
        session.flush()

        for candidate in candidates:
            session.add(
                PaperBlock(
                    paper_id=paper_id,
                    page_index=candidate.page_index,
                    block_index=candidate.block_index,
                    block_type=candidate.block_type,
                    text=candidate.text,
                    bbox_json=json.dumps(candidate.bbox) if candidate.bbox else "",
                    source_hash=candidate.source_hash,
                    source_json=candidate.source_json,
                )
            )
        session.flush()
        return len(candidates)


def _local_existing_path(value: str | None) -> Path | None:
    if not value or value.startswith(("http://", "https://")):
        return None
    path = Path(value)
    return path if path.exists() else None


def _json_names(archive: zipfile.ZipFile) -> list[str]:
    return [
        name for name in archive.namelist()
        if name.lower().endswith(".json") and "__macosx" not in name.lower()
    ]


def _zip_priority(name: str) -> tuple[int, str]:
    lower = name.lower()
    for index, marker in enumerate(_ZIP_JSON_PRIORITIES):
        if marker in lower:
            return index, lower
    return len(_ZIP_JSON_PRIORITIES), lower


def _iter_entries(payload: Any) -> Iterable[tuple[dict[str, Any], int | None]]:
    if isinstance(payload, dict):
        for key in ("content_list_v2", "content_list", "vlm_model"):
            if key in payload:
                yield from _iter_entries(payload[key])
                return
        if isinstance(payload.get("pdf_info"), list):
            yield from _iter_middle_entries(payload["pdf_info"])
            return
        if _looks_like_block(payload):
            yield payload, None
        return

    if isinstance(payload, list):
        if payload and all(isinstance(page, list) for page in payload):
            for page_index, page_entries in enumerate(payload):
                for entry in page_entries:
                    if isinstance(entry, dict):
                        yield entry, page_index
            return
        for entry in payload:
            if isinstance(entry, dict):
                yield entry, None


def _iter_middle_entries(pages: list[Any]) -> Iterable[tuple[dict[str, Any], int | None]]:
    for page in pages:
        if not isinstance(page, dict):
            continue
        page_index = _coerce_nonnegative_int(page.get("page_idx"))
        for key in ("para_blocks", "images", "tables", "interline_equations"):
            entries = page.get(key)
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if isinstance(entry, dict):
                    yield entry, page_index


def _looks_like_block(entry: dict[str, Any]) -> bool:
    return any(key in entry for key in ("type", "label", "text", "content", "bbox"))


def _normalize_entry(entry: dict[str, Any], page_hint: int | None, block_index: int) -> BlockCandidate | None:
    block_type = _normalize_block_type(entry)
    text = _extract_text(entry)
    bbox = _normalize_bbox(entry.get("bbox"))
    page_index = _coerce_nonnegative_int(
        entry.get("page_idx", entry.get("page_index", page_hint))
    )

    if not text and bbox is None:
        return None

    source = {"page_index": page_index, "entry": entry}
    source_hash = _source_hash(source)
    return BlockCandidate(
        page_index=page_index,
        block_index=block_index,
        block_type=block_type,
        text=text,
        bbox=bbox,
        source_json=_bounded_json(source),
        source_hash=source_hash,
    )


def _normalize_block_type(entry: dict[str, Any]) -> str:
    raw_type = str(entry.get("type") or entry.get("label") or "").lower()
    text_level = _coerce_nonnegative_int(entry.get("text_level"))
    if raw_type == "text" and text_level and text_level > 0:
        return PaperBlockType.TITLE

    for block_type, aliases in _TYPE_ALIASES.items():
        if raw_type in aliases:
            return block_type
    return PaperBlockType.UNKNOWN


def _extract_text(value: Any) -> str:
    parts: list[str] = []
    _collect_text(value, parts)
    seen: set[str] = set()
    normalized: list[str] = []
    for part in parts:
        stripped = part.strip()
        if stripped and stripped not in seen:
            seen.add(stripped)
            normalized.append(stripped)
    return "\n".join(normalized)


def _collect_text(value: Any, parts: list[str]) -> None:
    if isinstance(value, str):
        parts.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _collect_text(item, parts)
        return
    if not isinstance(value, dict):
        return

    for key in _TEXT_KEYS:
        if key in value:
            _collect_text(value[key], parts)


def _normalize_bbox(value: Any) -> list[float] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        coords = [float(part) for part in value]
    except (TypeError, ValueError):
        return None
    if coords[2] < coords[0] or coords[3] < coords[1]:
        return None
    scale = 1000.0 if all(0 <= part <= 1 for part in coords) else 1.0
    return [round(part * scale, 3) for part in coords]


def _coerce_nonnegative_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        integer = int(value)
    except (TypeError, ValueError):
        return None
    return integer if integer >= 0 else None


def _bounded_json(value: Any) -> str:
    serialized = _canonical_json(value)
    if len(serialized) <= MAX_SOURCE_JSON_CHARS:
        return serialized
    prefix_length = MAX_SOURCE_JSON_CHARS - len(_TRUNCATION_SUFFIX)
    return serialized[:prefix_length] + _TRUNCATION_SUFFIX


def _source_hash(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    )
