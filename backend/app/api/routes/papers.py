import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.category import Category
from app.models.chat_message import ChatMessageRecord
from app.models.chat_session import ChatSession
from app.models.daily_briefing import DailyBriefingPaperItem
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_embedding import PaperEmbedding
from app.models.paper_summary import PaperSummary
from app.models.venue_rank import VenueRank
from app.schemas.paper import (
    PaperDetailResponse,
    PaperImportRequest,
    PaperImportUrlRequest,
    PaperResponse,
    PaperUpdateRequest,
    VenueRankInfo,
)
from app.services.category_service import initialize_pending_category, update_paper_category
from app.services.http_client_factory import get_http_client
from app.services.pdf_metadata import extract_title_from_pdf
from app.services.pipeline import PaperPipelineService
from app.services.storage import StorageService, storage_file_url
from app.services.task_queue import BackgroundTaskQueue
from app.services.venue_enrichment_service import batch_backfill_missing_venues, get_venue_backfill_status
from app.services.venue_rank_service import _venue_key, apply_system_rank, batch_refresh_venue_ranks

_batch_refresh_state: dict = {
    "running": False,
    "stage": "",
    "last_error": "",
    "venue_backfill": {"total": 0, "resolved": 0, "no_source": 0, "no_match": 0, "error": 0},
    "venue_rank": {"total": 0, "success": 0, "no_data": 0, "error": 0, "pending": 0, "stopped_reason": ""},
}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/papers", tags=["papers"])

_PIPELINE_RUNTIME_STATE = (
    ("parse", "parse_status", "parsing", "parse_failed"),
    ("summarize", "summary_status", "summarizing", "summarize_failed"),
    ("embed", "embedding_status", None, None),
)


def _recover_stale_pipeline_state(session: Session, paper: Paper) -> Paper:
    queue = BackgroundTaskQueue()
    state_changed = False

    for task_type, field_name, running_status, failed_status in _PIPELINE_RUNTIME_STATE:
        if getattr(paper, field_name) != "processing":
            continue
        if queue.has_active_task(task_type, paper.id):
            continue

        logger.warning(
            "Recovering stale %s task state for paper %s; no active queue task found",
            task_type,
            paper.id,
        )
        setattr(paper, field_name, "failed")
        if running_status and failed_status and paper.status == running_status:
            paper.status = failed_status
        state_changed = True

    if not state_changed:
        return paper

    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def _mark_resolved_if_venue_present(paper: Paper, note: str) -> None:
    if paper.venue:
        paper.venue_resolution_status = "resolved"
        paper.venue_resolution_note = note


@router.post("/import", response_model=PaperResponse, status_code=201)
def import_paper(
    payload: PaperImportRequest, session: Session = Depends(get_session)
) -> Paper:
    storage = StorageService()

    try:
        stored_path = storage.import_pdf(payload.local_pdf_path)
    except (FileNotFoundError, PermissionError, IsADirectoryError) as exc:
        raise HTTPException(status_code=400, detail="PDF 文件不存在") from exc

    paper = Paper(
        title=payload.title,
        source=payload.source,
        local_pdf_path=stored_path,
    )
    apply_system_rank(paper, session)
    initialize_pending_category(session, paper, reason="Waiting for summary and automatic classification.")
    session.add(paper)

    try:
        session.commit()
    except Exception:
        session.rollback()
        shutil.rmtree(Path(stored_path).parent, ignore_errors=True)
        raise

    session.refresh(paper)
    return paper


@router.post("/import_url", response_model=PaperResponse, status_code=201)
def import_paper_from_url(
    payload: PaperImportUrlRequest, session: Session = Depends(get_session)
) -> Paper:
    import io

    try:
        client = get_http_client(follow_redirects=True, timeout=30.0)
        try:
            resp = client.get(payload.url)
            resp.raise_for_status()
            pdf_bytes = resp.content
        finally:
            client.close()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"下载 PDF 失败: {exc}") from exc

    storage = StorageService()
    file_obj = io.BytesIO(pdf_bytes)
    filename = payload.source_id + ".pdf" if payload.source_id else "downloaded.pdf"

    try:
        stored_path = storage.import_uploaded_pdf(filename, file_obj)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"存储 PDF 失败: {exc}") from exc

    published_date = None
    if payload.published_at:
        try:
            published_date = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            pass

    paper = Paper(
        title=payload.title,
        source=payload.source,
        source_id=payload.source_id,
        authors=payload.authors,
        abstract_raw=payload.abstract,
        pdf_url=payload.url,
        published_at=published_date,
        local_pdf_path=stored_path,
    )
    apply_system_rank(paper, session)
    initialize_pending_category(session, paper, reason="Waiting for summary and automatic classification.")
    session.add(paper)

    try:
        session.commit()
    except Exception:
        session.rollback()
        shutil.rmtree(Path(stored_path).parent, ignore_errors=True)
        raise

    session.refresh(paper)
    return paper


@router.post("/upload", response_model=PaperResponse, status_code=201)
def upload_paper(
    source: str = Form("manual"),
    title: str = Form(""),
    pdf_file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> Paper:
    storage = StorageService()

    if not pdf_file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    if not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    try:
        stored_path = storage.import_uploaded_pdf(pdf_file.filename, pdf_file.file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="上传失败，请稍后重试") from exc
    finally:
        pdf_file.file.close()

    guessed_title = extract_title_from_pdf(
        stored_path, fallback_name=Path(pdf_file.filename).stem
    )
    final_title = title.strip() or guessed_title or Path(pdf_file.filename).stem

    paper = Paper(
        title=final_title,
        source=source.strip() or "manual",
        local_pdf_path=stored_path,
    )
    apply_system_rank(paper, session)
    initialize_pending_category(session, paper, reason="Waiting for summary and automatic classification.")
    session.add(paper)

    try:
        session.commit()
    except Exception:
        session.rollback()
        shutil.rmtree(Path(stored_path).parent, ignore_errors=True)
        raise

    session.refresh(paper)
    return paper


@router.get("", response_model=list[PaperResponse])
def list_papers(session: Session = Depends(get_session)) -> list[Paper]:
    papers = list(session.exec(select(Paper).order_by(Paper.created_at.desc())).all())
    return [_recover_stale_pipeline_state(session, paper) for paper in papers]


@router.get("/tags/all", response_model=list[str])
def list_all_tags(session: Session = Depends(get_session)) -> list[str]:
    import json as _json

    papers = list(session.exec(select(Paper)).all())
    tag_set: set[str] = set()
    for p in papers:
        try:
            tags = _json.loads(p.tags_json)
            if isinstance(tags, list):
                tag_set.update(t for t in tags if isinstance(t, str))
        except (ValueError, TypeError):
            pass
    return sorted(tag_set)


@router.post("/rebuild-representative-images")
def rebuild_representative_images(session: Session = Depends(get_session)) -> dict:
    from app.services.block_extraction_service import BlockExtractionService

    papers = list(
        session.exec(
            select(Paper).where(
                Paper.representative_image_path == "",
                Paper.parse_status == "completed",
            )
        ).all()
    )

    service = BlockExtractionService()
    success_count = 0
    failure_count = 0

    for paper in papers:
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).first()
        if content is None:
            failure_count += 1
            continue

        try:
            result = service.rebuild_blocks(session, paper, content)
            paper.representative_image_path = result.representative_image_path
            session.add(paper)
            content.block_extraction_error = ""
            session.add(content)
            session.commit()
            if result.representative_image_path:
                success_count += 1
            else:
                failure_count += 1
        except Exception:
            session.rollback()
            logger.warning("代表图重建失败: paper_id=%s", paper.id, exc_info=True)
            failure_count += 1

    return {
        "total": len(papers),
        "success": success_count,
        "failure": failure_count,
    }


class SemanticSearchResult(BaseModel):
    paper: PaperResponse
    similarity: float


@router.get("/search/semantic", response_model=list[SemanticSearchResult])
def semantic_search(
    query: str = Query(..., min_length=1),
    top_k: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
) -> list[SemanticSearchResult]:
    import json as _json
    import math
    from app.models.paper_embedding import PaperEmbedding
    from app.services.embedding_service import EmbeddingService

    try:
        query_vec = EmbeddingService.encode(query)
    except Exception as e:
        from app.services.embedding_service import EmbeddingUnavailableError
        if isinstance(e, EmbeddingUnavailableError):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Embedding模型加载失败: {e}")

    embeddings = list(session.exec(select(PaperEmbedding)).all())
    if not embeddings:
        return []

    def cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    scored: list[tuple[int, float]] = []
    for emb in embeddings:
        try:
            vec = _json.loads(emb.embedding_json)
            sim = cosine_sim(query_vec, vec)
            scored.append((emb.paper_id, sim))
        except Exception:
            continue

    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:top_k]

    results: list[SemanticSearchResult] = []
    for paper_id, sim in top:
        paper = session.get(Paper, paper_id)
        if paper:
            results.append(SemanticSearchResult(
                paper=PaperResponse.model_validate(paper),
                similarity=round(sim, 4),
            ))
    return results


@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(
    paper_id: int, session: Session = Depends(get_session)
) -> PaperDetailResponse:
    paper = session.get(Paper, paper_id)
    paper = _recover_stale_pipeline_state(session, paper) if paper is not None else None
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()
    summary = session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).first()

    import json as _json
    try:
        tags = _json.loads(paper.tags_json)
    except (ValueError, TypeError):
        tags = []

    venue_rank_row = None
    if paper.venue:
        vk = _venue_key(paper.venue)
        if vk:
            venue_rank_row = session.get(VenueRank, vk)

    venue_rank_val = None
    if venue_rank_row is not None and venue_rank_row.query_status == "success":
        venue_rank_val = VenueRankInfo(
            impact_factor=venue_rank_row.impact_factor,
            impact_factor_5y=venue_rank_row.impact_factor_5y,
            jcr_sci=venue_rank_row.jcr_sci,
            jcr_ssci=venue_rank_row.jcr_ssci,
            cas_upgrade=venue_rank_row.cas_upgrade,
            cas_upgrade_top=venue_rank_row.cas_upgrade_top,
            cas_base=venue_rank_row.cas_base,
            cas_upgrade_small=venue_rank_row.cas_upgrade_small,
            jci=venue_rank_row.jci,
            esi=venue_rank_row.esi,
            warn=venue_rank_row.warn,
            ei=venue_rank_row.ei,
            ahci=venue_rank_row.ahci,
            cssci=venue_rank_row.cssci,
            pku=venue_rank_row.pku,
            cscd=venue_rank_row.cscd,
            utd24=venue_rank_row.utd24,
            ft50=venue_rank_row.ft50,
            ajg=venue_rank_row.ajg,
            fms=venue_rank_row.fms,
            swufe=venue_rank_row.swufe,
            cufe=venue_rank_row.cufe,
            uibe=venue_rank_row.uibe,
            sdufe=venue_rank_row.sdufe,
        )

    return PaperDetailResponse(
        venue_rank=venue_rank_val,
        id=paper.id,
        title=paper.title,
        source=paper.source,
        authors=paper.authors,
        abstract_raw=paper.abstract_raw,
        year=paper.year,
        venue=paper.venue,
        doi=paper.doi,
        url=paper.url,
        ccf_rank=paper.ccf_rank,
        sci_zone=paper.sci_zone,
        impact_factor=paper.impact_factor,
        ccf_rank_override=paper.ccf_rank_override,
        sci_zone_override=paper.sci_zone_override,
        impact_factor_override=paper.impact_factor_override,
        favorite=paper.favorite,
        reading_status=paper.reading_status,
        reading_progress=paper.reading_progress,
        user_notes=paper.user_notes,
        status=paper.status,
        parse_status=paper.parse_status,
        summary_status=paper.summary_status,
        embedding_status=paper.embedding_status,
        local_pdf_path=paper.local_pdf_path,
        representative_image_url=storage_file_url(paper.representative_image_path),
        primary_category_id=paper.primary_category_id,
        category_status=paper.category_status,
        category_confidence=paper.category_confidence,
        category_reason=paper.category_reason,
        tags=tags,
        full_markdown=content.full_markdown if content else "",
        abstract_md=content.abstract_md if content else "",
        introduction_md=content.introduction_md if content else "",
        method_md=content.method_md if content else "",
        conclusion_md=content.conclusion_md if content else "",
        one_line_summary=summary.one_line_summary if summary else "",
        core_contributions=summary.core_contributions if summary else "",
        method_summary=summary.method_summary if summary else "",
        use_cases=summary.use_cases if summary else "",
        limitations=summary.limitations if summary else "",
        relevance_note=summary.relevance_note if summary else "",
    )


@router.post("/{paper_id}/parse", status_code=202)
def parse_paper(paper_id: int, session: Session = Depends(get_session)) -> dict:
    paper = session.get(Paper, paper_id)
    paper = _recover_stale_pipeline_state(session, paper) if paper is not None else None
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    if paper.parse_status == "processing":
        raise HTTPException(status_code=409, detail="当前论文解析任务正在进行中")

    paper.status = "parsing"
    paper.parse_status = "processing"
    session.add(paper)
    session.commit()
    queue = BackgroundTaskQueue()

    def run_parse():
        from app.core.db import engine
        from sqlmodel import Session as SyncSession

        with SyncSession(engine) as db:
            p = db.get(Paper, paper_id)
            if p is None:
                return
            try:
                PaperPipelineService().parse_paper(db, p)
            except Exception:
                logger.exception("Background parse failed for paper %s", paper_id)
                raise

    task_id = queue.submit("parse", run_parse, paper_id=paper_id)
    return {"task_id": task_id, "message": "解析任务已提交"}


@router.post("/{paper_id}/summarize", status_code=202)
def summarize_paper(
    paper_id: int,
    model: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    if paper.parse_status != "completed":
        raise HTTPException(status_code=400, detail="论文尚未完成解析")

    paper.status = "summarizing"
    paper.summary_status = "processing"
    session.add(paper)
    session.commit()

    queue = BackgroundTaskQueue()

    def run_summarize():
        from app.core.db import engine
        from sqlmodel import Session as SyncSession

        with SyncSession(engine) as db:
            p = db.get(Paper, paper_id)
            if p is None:
                return
            try:
                PaperPipelineService().summarize_paper(db, p, model)
            except Exception:
                logger.exception("Background summarize failed for paper %s", paper_id)
                raise

    task_id = queue.submit("summarize", run_summarize, paper_id=paper_id)
    return {"task_id": task_id, "message": "摘要生成任务已提交"}


@router.post("/{paper_id}/translate-abstract")
def translate_abstract(
    paper_id: int,
    model: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()

    abstract_text = ""
    if content and content.abstract_md:
        abstract_text = content.abstract_md
    elif paper.abstract_raw:
        abstract_text = paper.abstract_raw

    if not abstract_text.strip():
        raise HTTPException(status_code=400, detail="论文没有摘要内容可翻译")

    from app.services.deepseek_client import DeepSeekClient

    client = DeepSeekClient()
    try:
        result = client.translate_block_text(
            text=abstract_text,
            target_language="zh-CN",
            model=model,
            page_index=None,
            block_type="abstract",
        )
        translated = result.get("translated_text", "")
        return {"translated_text": translated, "original_text": abstract_text}
    except Exception as exc:
        logger.exception("Abstract translation failed for paper %s", paper_id)
        raise HTTPException(status_code=500, detail=f"翻译失败: {str(exc)}") from exc


@router.delete("/{paper_id}")
def delete_paper(paper_id: int, session: Session = Depends(get_session)) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    chat_sessions = list(session.exec(select(ChatSession).where(ChatSession.paper_id == paper_id)).all())
    for cs in chat_sessions:
        for msg in session.exec(select(ChatMessageRecord).where(ChatMessageRecord.session_id == cs.id)).all():
            session.delete(msg)
        session.delete(cs)

    embedding = session.exec(select(PaperEmbedding).where(PaperEmbedding.paper_id == paper_id)).first()
    if embedding:
        session.delete(embedding)

    for bp_item in session.exec(select(DailyBriefingPaperItem).where(DailyBriefingPaperItem.paper_id == paper_id)).all():
        session.delete(bp_item)

    for ing_item in session.exec(select(IngestionItem).where(IngestionItem.paper_id == paper_id)).all():
        ing_item.paper_id = None
        session.add(ing_item)

    content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()
    if content:
        session.delete(content)

    summary = session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).first()
    if summary:
        session.delete(summary)

    session.flush()

    if paper.local_pdf_path:
        storage_path = Path(paper.local_pdf_path)
        if storage_path.exists():
            shutil.rmtree(storage_path.parent, ignore_errors=True)

    session.delete(paper)
    session.commit()
    return {"success": True}


@router.get("/search", response_model=list[PaperResponse])
def search_papers(
    q: str = Query(default=""),
    status: str = Query(default=""),
    source: str = Query(default=""),
    session: Session = Depends(get_session),
) -> list[Paper]:
    query = select(Paper)

    if q:
        query = query.where(Paper.title.contains(q))
    if status:
        query = query.where(Paper.status == status)
    if source:
        query = query.where(Paper.source == source)

    query = query.order_by(Paper.created_at.desc())
    return list(session.exec(query).all())


@router.patch("/{paper_id}", response_model=PaperResponse)
def update_paper(
    paper_id: int,
    payload: PaperUpdateRequest | None = Body(default=None),
    title: str | None = Query(default=None),
    source: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Paper:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    updates = payload.model_dump(exclude_unset=True) if payload is not None else {}
    if title is not None and "title" not in updates:
        updates["title"] = title
    if source is not None and "source" not in updates:
        updates["source"] = source

    updates = PaperUpdateRequest(**updates).model_dump(exclude_unset=True)
    old_venue = paper.venue
    for field_name, value in updates.items():
        setattr(paper, field_name, value)

    if "venue" in updates and paper.venue != old_venue:
        if paper.venue:
            paper.venue_resolution_status = "resolved"
            paper.venue_resolution_note = "manual_update"
        else:
            paper.venue_resolution_status = "pending"
            paper.venue_resolution_note = "venue_cleared"
        apply_system_rank(paper, session)

    if updates:
        paper.updated_at = datetime.now(timezone.utc)

    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


@router.get("/{paper_id}/pdf")
def get_paper_pdf(paper_id: int, session: Session = Depends(get_session)):
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    if not paper.local_pdf_path:
        raise HTTPException(status_code=404, detail="PDF 文件路径未设置")

    pdf_path = Path(paper.local_pdf_path)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF 文件不存在")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"{paper.title}.pdf",
        headers={"Content-Disposition": "inline"},
    )


class UpdateTagsRequest(BaseModel):
    tags: list[str]


class UpdatePrimaryCategoryRequest(BaseModel):
    primary_category_id: int


@router.put("/{paper_id}/tags", response_model=PaperResponse)
def update_paper_tags(
    paper_id: int,
    req: UpdateTagsRequest,
    session: Session = Depends(get_session),
) -> Paper:
    import json as _json

    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")
    paper.tags_json = _json.dumps(req.tags, ensure_ascii=False)
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


@router.put("/{paper_id}/category", response_model=PaperResponse)
def update_primary_category(
    paper_id: int,
    req: UpdatePrimaryCategoryRequest,
    session: Session = Depends(get_session),
) -> Paper:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    category = session.get(Category, req.primary_category_id)
    if category is None or not category.is_active:
        raise HTTPException(status_code=404, detail="分类目录不存在")

    return update_paper_category(
        session,
        paper,
        category,
        confidence=1.0,
        status="manual_locked",
        reason=f"Manually assigned to {category.name}.",
    )


@router.post("/{paper_id}/embed", status_code=202)
def embed_paper(paper_id: int, session: Session = Depends(get_session)) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()
    if content is None:
        raise HTTPException(status_code=400, detail="论文尚未解析，请先解析")

    queue = BackgroundTaskQueue()

    def run_embed():
        from app.core.db import engine
        from sqlmodel import Session as SyncSession

        with SyncSession(engine) as db:
            p = db.get(Paper, paper_id)
            c = db.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()
            if p and c:
                try:
                    PaperPipelineService().generate_embedding(db, p, c)
                except Exception:
                    logger.exception("Background embedding failed for paper %s", paper_id)
                    raise

    task_id = queue.submit("embed", run_embed, paper_id=paper_id)
    return {"task_id": task_id, "message": "向量生成任务已提交"}


@router.post("/refresh-venue-ranks")
def refresh_venue_ranks(session: Session = Depends(get_session)) -> dict:
    from app.services.easyscholar_settings_service import EasyScholarSettingsService
    from app.services.venue_rank_service import is_ccf_venue

    settings = EasyScholarSettingsService.get_settings(session)
    if not settings.enabled or not settings.api_key:
        raise HTTPException(status_code=400, detail="EasyScholar 未启用或 API Key 未配置")

    if _batch_refresh_state["running"]:
        raise HTTPException(status_code=409, detail="刷新任务已在运行中")

    total_venues = len(list(session.exec(select(VenueRank)).all()))
    if total_venues == 0:
        papers = list(session.exec(select(Paper)).all())
        venues = set()
        for p in papers:
            if p.venue and not is_ccf_venue(p.venue):
                key = _venue_key(p.venue)
                if key:
                    venues.add(key)
        total_venues = len(venues)

    venue_status = get_venue_backfill_status(session)

    def _run():
        import threading  # noqa: F401
        from app.core.db import engine
        from sqlmodel import Session as SyncSession

        with SyncSession(engine) as db:
            _batch_refresh_state["running"] = True
            _batch_refresh_state["stage"] = "venue_backfill"
            _batch_refresh_state["last_error"] = ""
            try:
                _batch_refresh_state["venue_backfill"] = batch_backfill_missing_venues(db)
                _batch_refresh_state["stage"] = "venue_rank_refresh"
                _batch_refresh_state["venue_rank"] = batch_refresh_venue_ranks(
                    db,
                    EasyScholarSettingsService.get_settings(db).api_key,
                )
                _batch_refresh_state["stage"] = "completed"
            except Exception as exc:
                logger.exception("Combined venue backfill + EasyScholar refresh failed")
                _batch_refresh_state["stage"] = "failed"
                _batch_refresh_state["last_error"] = str(exc)
            finally:
                _batch_refresh_state["running"] = False

    import threading

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {
        "message": "venue 补全与 EasyScholar 刷新任务已启动",
        "total_venues": total_venues,
        "missing_venues": venue_status["missing_total"],
        "supported_missing_venues": venue_status["supported_missing"],
    }


@router.post("/backfill-venues")
def backfill_venues(session: Session = Depends(get_session)) -> dict:
    return refresh_venue_ranks(session)


@router.get("/venue-ranks/status")
def get_venue_ranks_status(session: Session = Depends(get_session)) -> dict:
    from app.services.venue_rank_service import is_ccf_venue

    rows = list(session.exec(select(VenueRank)).all())
    total = len(rows)
    success = sum(1 for r in rows if r.query_status == "success")
    no_data = sum(1 for r in rows if r.query_status == "no_data")
    error_count = sum(1 for r in rows if r.query_status == "error")
    pending = sum(1 for r in rows if r.query_status == "pending")

    if pending == 0 and total == 0:
        papers = list(session.exec(select(Paper)).all())
        venues = set()
        for p in papers:
            if p.venue and not is_ccf_venue(p.venue):
                key = _venue_key(p.venue)
                if key:
                    venues.add(key)
        total = len(venues)

    venue_status = get_venue_backfill_status(session)

    return {
        "total": total,
        "success": success,
        "no_data": no_data,
        "error": error_count,
        "pending": pending,
        "running": _batch_refresh_state["running"],
        "stage": _batch_refresh_state["stage"],
        "last_error": _batch_refresh_state["last_error"],
        "venue_backfill": {
            **venue_status,
            "last_run": _batch_refresh_state["venue_backfill"],
        },
        "venue_rank": _batch_refresh_state["venue_rank"],
    }


@router.get("/backfill-venues/status")
def get_backfill_venues_status(session: Session = Depends(get_session)) -> dict:
    return get_venue_ranks_status(session)
