import json
from collections import Counter

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import PaperBlockTranslation
from app.models.paper_content import PaperContent
from app.schemas.paper_blocks import (
    BlockTranslateRequest,
    PaperBlockRebuildResponse,
    PaperBlockResponse,
    PaperBlockTranslationResponse,
    PaperBlocksResponse,
)
from app.services.block_extraction_service import BlockExtractionService
from app.services.block_translation_service import BlockTranslationService


router = APIRouter(prefix="/papers", tags=["paper-blocks"])


@router.get("/{paper_id}/blocks", response_model=PaperBlocksResponse)
def list_paper_blocks(
    paper_id: int,
    page: int | None = Query(default=None, ge=0),
    block_type: str | None = Query(default=None, alias="type"),
    search: str = Query(default=""),
    q: str = Query(default=""),
    session: Session = Depends(get_session),
) -> PaperBlocksResponse:
    _require_paper(session, paper_id)
    blocks = _load_ordered_blocks(session, paper_id)
    filtered = _filter_blocks(blocks, page=page, block_type=block_type, search=search or q)
    content = session.exec(
        select(PaperContent).where(PaperContent.paper_id == paper_id)
    ).first()
    return _blocks_response(
        paper_id, blocks, filtered,
        error=content.block_extraction_error if content else "",
    )


@router.post("/{paper_id}/blocks/rebuild", response_model=PaperBlockRebuildResponse)
def rebuild_paper_blocks(
    paper_id: int,
    session: Session = Depends(get_session),
) -> PaperBlockRebuildResponse:
    paper = _require_paper(session, paper_id)
    content = session.exec(
        select(PaperContent).where(PaperContent.paper_id == paper_id)
    ).first()
    if content is None or not (content.content_json_path or content.full_zip_path):
        raise HTTPException(status_code=409, detail="No parse artifact available")

    try:
        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        paper.representative_image_path = result.representative_image_path
        session.add(paper)
        content.block_extraction_error = ""
        session.add(content)
        session.commit()
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail="Block rebuild failed") from exc

    return PaperBlockRebuildResponse(
        paper_id=result.paper_id,
        block_count=result.block_count,
        has_blocks=result.has_blocks,
    )


@router.post(
    "/{paper_id}/blocks/{block_id}/translate",
    response_model=PaperBlockTranslationResponse,
)
def translate_paper_block(
    paper_id: int,
    block_id: int,
    payload: BlockTranslateRequest | None = Body(default=None),
    session: Session = Depends(get_session),
) -> PaperBlockTranslationResponse:
    paper = _require_paper(session, paper_id)
    block = session.get(PaperBlock, block_id)
    if block is None or block.paper_id != paper_id:
        raise HTTPException(status_code=404, detail="Block not found")

    request = payload or BlockTranslateRequest()
    try:
        translation = BlockTranslationService().translate_block(
            session,
            paper,
            block,
            target_language=request.target_language,
            model=request.model,
            force_refresh=request.force_refresh,
        )
        session.commit()
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _translation_response(translation)


def _require_paper(session: Session, paper_id: int) -> Paper:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


def _load_ordered_blocks(session: Session, paper_id: int) -> list[PaperBlock]:
    return list(
        session.exec(
            select(PaperBlock)
            .where(PaperBlock.paper_id == paper_id)
            .order_by(PaperBlock.block_index)
        ).all()
    )


def _filter_blocks(
    blocks: list[PaperBlock],
    *,
    page: int | None,
    block_type: str | None,
    search: str,
) -> list[PaperBlock]:
    needle = search.strip().lower()
    filtered: list[PaperBlock] = []
    for block in blocks:
        if page is not None and block.page_index != page:
            continue
        if block_type and block.block_type != block_type:
            continue
        if needle and needle not in block.text.lower():
            continue
        filtered.append(block)
    return filtered


def _blocks_response(
    paper_id: int,
    blocks: list[PaperBlock],
    filtered: list[PaperBlock],
    error: str = "",
) -> PaperBlocksResponse:
    pages = sorted({block.page_index for block in blocks if block.page_index is not None})
    type_counts = Counter(block.block_type for block in blocks)
    return PaperBlocksResponse(
        paper_id=paper_id,
        total=len(blocks),
        returned=len(filtered),
        pages=pages,
        block_types=dict(sorted(type_counts.items())),
        has_blocks=bool(blocks),
        blocks=[_block_response(block) for block in filtered],
        error=error,
    )


def _block_response(block: PaperBlock) -> PaperBlockResponse:
    return PaperBlockResponse(
        id=block.id,
        paper_id=block.paper_id,
        page_index=block.page_index,
        block_index=block.block_index,
        block_type=block.block_type,
        text=block.text,
        bbox=_parse_bbox(block.bbox_json),
        asset_path=block.asset_path,
        source_hash=block.source_hash,
    )


def _translation_response(
    translation: PaperBlockTranslation,
) -> PaperBlockTranslationResponse:
    return PaperBlockTranslationResponse(
        id=translation.id,
        paper_id=translation.paper_id,
        block_id=translation.block_id,
        target_language=translation.target_language,
        model_name=translation.model_name,
        prompt_version=translation.prompt_version,
        source_hash=translation.source_hash,
        translated_text=translation.translated_text,
        status=translation.status,
        error_message=translation.error_message,
    )


def _parse_bbox(value: str) -> list[float] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list) or len(parsed) != 4:
        return None
    try:
        return [float(part) for part in parsed]
    except (TypeError, ValueError):
        return None
