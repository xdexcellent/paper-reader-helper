from __future__ import annotations

import hashlib
import json
import logging
import shutil
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block import PaperBlockType
from app.models.paper_block_translation import PaperBlockTranslation
from app.models.paper_content import PaperContent
from app.services.storage import storage_file_url

logger = logging.getLogger(__name__)


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
    asset_path: str
    source_json: str
    source_hash: str


@dataclass(frozen=True)
class BlockRebuildResult:
    paper_id: int
    block_count: int
    has_blocks: bool
    representative_image_path: str = ""
    representative_image_url: str = ""


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
        parse_result = {
            "content_json_path": content.content_json_path,
            "full_zip_path": content.full_zip_path,
        }

        # 如果 full_zip_path 是远程 URL，下载并持久化到本地
        full_zip_path = content.full_zip_path
        if full_zip_path and full_zip_path.startswith(("http://", "https://")):
            local_zip = _download_and_persist_remote_zip(
                full_zip_path, paper.local_pdf_path
            )
            if local_zip:
                content.full_zip_path = local_zip
                session.add(content)
                session.flush()
                parse_result["full_zip_path"] = local_zip
                logger.info(
                    "远程 ZIP 已下载并持久化: paper_id=%s, local=%s",
                    paper.id,
                    local_zip,
                )

        candidates = self.extract_from_parse_result(parse_result)
        representative_image_path = self.extract_representative_image(
            parse_result,
            candidates,
            paper.local_pdf_path,
        )
        block_count = 0
        try:
            block_count = self.replace_blocks(session, paper.id, candidates)
        except Exception:
            logger.warning(
                "replace_blocks 失败，但代表图已提取，继续返回: paper_id=%s",
                paper.id,
                exc_info=True,
            )
            session.rollback()
        return BlockRebuildResult(
            paper_id=paper.id,
            block_count=block_count,
            has_blocks=block_count > 0,
            representative_image_path=representative_image_path,
            representative_image_url=storage_file_url(representative_image_path),
        )

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
                    asset_path=candidate.asset_path,
                    source_hash=candidate.source_hash,
                    source_json=candidate.source_json,
                )
            )
        session.flush()
        return len(candidates)

    def extract_representative_image(
        self,
        parse_result: dict[str, str],
        candidates: list[BlockCandidate],
        local_pdf_path: str,
    ) -> str:
        zip_path = _local_existing_path(parse_result.get("full_zip_path", ""))
        if zip_path is None:
            return ""

        image_candidate = _select_representative_image(candidates)
        if image_candidate is None or not image_candidate.asset_path:
            return ""

        return _extract_zip_asset(
            zip_path,
            image_candidate.asset_path,
            local_pdf_path,
            image_candidate.source_hash,
        )


def _local_existing_path(value: str | None) -> Path | None:
    if not value or value.startswith(("http://", "https://")):
        return None
    path = Path(value)
    return path if path.exists() else None


def _download_and_persist_remote_zip(remote_url: str, local_pdf_path: str) -> str:
    """下载远程 ZIP 并持久化到本地 {paper_dir}/mineru/result.zip。

    与 MineruClient._persist_result_zip 保持一致的目标路径。
    成功返回本地路径字符串，失败返回空字符串。
    """
    try:
        from app.services.http_client_factory import get_http_client

        client = get_http_client(timeout=120)
        try:
            resp = client.get(remote_url)
            resp.raise_for_status()
            zip_content = resp.content
        finally:
            client.close()

        # 验证下载内容是有效的 ZIP，防止写入无效文件（如 HTML 错误页面）
        try:
            zipfile.ZipFile(BytesIO(zip_content))
        except zipfile.BadZipFile:
            logger.warning(
                "远程 URL 返回的内容不是有效 ZIP: %s", remote_url
            )
            return ""

        paper_dir = Path(local_pdf_path).resolve().parent
        mineru_dir = paper_dir / "mineru"
        mineru_dir.mkdir(parents=True, exist_ok=True)
        target = mineru_dir / "result.zip"
        target.write_bytes(zip_content)
        return str(target)
    except Exception:
        logger.warning("下载远程 ZIP 失败: %s", remote_url, exc_info=True)
        return ""


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
    asset_path = _extract_asset_path(entry)
    page_index = _coerce_nonnegative_int(
        entry.get("page_idx", entry.get("page_index", page_hint))
    )

    if (
        not text
        and bbox is None
        and not (asset_path and block_type in {PaperBlockType.IMAGE, PaperBlockType.CHART})
    ):
        return None

    source = {"page_index": page_index, "entry": entry}
    source_hash = _source_hash(source)
    return BlockCandidate(
        page_index=page_index,
        block_index=block_index,
        block_type=block_type,
        text=text,
        bbox=bbox,
        asset_path=asset_path,
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


def _extract_asset_path(entry: dict[str, Any]) -> str:
    return _find_nested_asset_path(entry)


def _find_nested_asset_path(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("img_path", "image_path", "path", "url"):
            raw = value.get(key)
            if isinstance(raw, str) and _looks_like_asset_path(raw):
                return raw.strip()

        for nested in value.values():
            if isinstance(nested, (dict, list)):
                asset_path = _find_nested_asset_path(nested)
                if asset_path:
                    return asset_path
    elif isinstance(value, list):
        for item in value:
            asset_path = _find_nested_asset_path(item)
            if asset_path:
                return asset_path
    return ""


def _looks_like_asset_path(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if stripped.startswith(("http://", "https://")):
        return True
    suffix = Path(stripped.split("?", 1)[0]).suffix.lower()
    return suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}


def _select_representative_image(candidates: list[BlockCandidate]) -> BlockCandidate | None:
    image_candidates = [
        candidate
        for candidate in candidates
        if candidate.block_type in {PaperBlockType.IMAGE, PaperBlockType.CHART}
        and candidate.asset_path
    ]
    if not image_candidates:
        return None

    def score(candidate: BlockCandidate) -> tuple[int, int, int, int, float, int]:
        caption_penalty = 0 if _has_representative_caption(candidate.text) else 1
        cover_penalty = 1 if candidate.page_index in (None, 0) and caption_penalty else 0
        page_score = candidate.page_index if candidate.page_index is not None else 999
        type_score = 0 if candidate.block_type == PaperBlockType.IMAGE else 1
        area = _bbox_area(candidate.bbox)
        return (caption_penalty, cover_penalty, page_score, type_score, -area, candidate.block_index)

    return sorted(image_candidates, key=score)[0]


def _has_representative_caption(text: str) -> bool:
    lower = text.lower()
    return any(marker in lower for marker in ("figure", "fig.", "fig ", "图"))


def _bbox_area(bbox: list[float] | None) -> float:
    if not bbox:
        return 0.0
    return max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1])


def _extract_zip_asset(
    zip_path: Path,
    asset_path: str,
    local_pdf_path: str,
    source_hash: str,
) -> str:
    if asset_path.startswith(("http://", "https://")):
        return ""

    with zipfile.ZipFile(zip_path) as archive:
        asset_name = _find_zip_member(archive, asset_path)
        if asset_name is None:
            return ""

        suffix = Path(asset_name).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
            return ""

        target_dir = Path(local_pdf_path).resolve().parent / "representative-images"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{source_hash[:16]}{suffix}"
        with archive.open(asset_name) as source, target.open("wb") as output:
            shutil.copyfileobj(source, output)
        return str(target)


def _find_zip_member(archive: zipfile.ZipFile, asset_path: str) -> str | None:
    normalized_target = asset_path.replace("\\", "/").lstrip("/")
    by_exact = {name.replace("\\", "/").lstrip("/"): name for name in archive.namelist()}
    if normalized_target in by_exact:
        return by_exact[normalized_target]

    target_suffix = "/" + normalized_target
    for normalized, original in by_exact.items():
        if normalized.endswith(target_suffix):
            return original
    return None


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
