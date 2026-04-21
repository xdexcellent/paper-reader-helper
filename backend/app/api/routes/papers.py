import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.category import Category
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary
from app.schemas.paper import PaperDetailResponse, PaperImportRequest, PaperImportUrlRequest, PaperResponse
from app.services.category_service import initialize_pending_category, update_paper_category
from app.services.pdf_metadata import extract_title_from_pdf
from app.services.pipeline import PaperPipelineService
from app.services.storage import StorageService
from app.services.task_queue import BackgroundTaskQueue

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
    """Download a paper from URL and add to library."""
    import httpx
    import io
    from app.services.storage import StorageService
    from datetime import datetime

    # Download the PDF
    try:
        # Use a timeout of 30s for downloading PDF
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            resp = client.get(payload.url)
            resp.raise_for_status()
            pdf_bytes = resp.content
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"下载 PDF 失败: {exc}") from exc

    # Save to storage
    storage = StorageService()
    file_obj = io.BytesIO(pdf_bytes)
    # Give it a safe filename, if it's arxiv id we can use it
    filename = payload.source_id + ".pdf" if payload.source_id else "downloaded.pdf"
    
    try:
        stored_path = storage.import_uploaded_pdf(filename, file_obj)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"存储 PDF 失败: {exc}") from exc

    # Parse published_at
    published_date = None
    if payload.published_at:
        try:
            # Simple ISO parse fallback
            published_date = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Create record
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
    initialize_pending_category(session, paper, reason="Waiting for summary and automatic classification.")
    session.add(paper)

    try:
        session.commit()
    except Exception:
        session.rollback()
        import shutil
        from pathlib import Path
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
    """Return all unique tags across all papers."""
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


class SemanticSearchResult(BaseModel):
    paper: PaperResponse
    similarity: float


@router.get("/search/semantic", response_model=list[SemanticSearchResult])
def semantic_search(
    query: str = Query(..., min_length=1),
    top_k: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
) -> list[SemanticSearchResult]:
    """Perform semantic vector search across papers with embeddings."""
    import json as _json
    import math
    from app.models.paper_embedding import PaperEmbedding
    from app.services.embedding_service import EmbeddingService

    try:
        query_vec = EmbeddingService.encode(query)
    except Exception as e:
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

    content = session.exec(
        select(PaperContent).where(PaperContent.paper_id == paper_id)
    ).first()
    summary = session.exec(
        select(PaperSummary).where(PaperSummary.paper_id == paper_id)
    ).first()

    import json as _json
    try:
        tags = _json.loads(paper.tags_json)
    except (ValueError, TypeError):
        tags = []

    return PaperDetailResponse(
        id=paper.id,
        title=paper.title,
        source=paper.source,
        status=paper.status,
        parse_status=paper.parse_status,
        summary_status=paper.summary_status,
        embedding_status=paper.embedding_status,
        local_pdf_path=paper.local_pdf_path,
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

    # Mark as parsing immediately
    paper.status = "parsing"
    paper.parse_status = "processing"
    session.add(paper)
    session.commit()
    queue = BackgroundTaskQueue()

    def run_parse():
        from sqlmodel import Session as SyncSession
        from app.core.db import engine
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
    model: str = Query(default="gpt-5.4-mini"),
    session: Session = Depends(get_session),
) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    # Check that parsing is done
    if paper.parse_status != "completed":
        raise HTTPException(status_code=400, detail="论文尚未完成解析")

    # Mark as summarizing immediately
    paper.status = "summarizing"
    paper.summary_status = "processing"
    session.add(paper)
    session.commit()

    from app.services.task_queue import BackgroundTaskQueue

    queue = BackgroundTaskQueue()

    def run_summarize():
        from sqlmodel import Session as SyncSession
        from app.core.db import engine
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



@router.delete("/{paper_id}")
def delete_paper(paper_id: int, session: Session = Depends(get_session)) -> dict:
    """删除论文及其关联数据"""
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    # 删除关联的内容和摘要
    content = session.exec(
        select(PaperContent).where(PaperContent.paper_id == paper_id)
    ).first()
    if content:
        session.delete(content)

    summary = session.exec(
        select(PaperSummary).where(PaperSummary.paper_id == paper_id)
    ).first()
    if summary:
        session.delete(summary)

    session.flush()


    # 删除存储的文件
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
    """搜索和过滤论文"""
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
    title: str | None = None,
    source: str | None = None,
    session: Session = Depends(get_session),
) -> Paper:
    """更新论文信息"""
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    if title is not None:
        paper.title = title
    if source is not None:
        paper.source = source

    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


@router.get("/{paper_id}/pdf")
def get_paper_pdf(paper_id: int, session: Session = Depends(get_session)):
    """Return the PDF file for in-browser viewing."""
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


# ─── Tags ───────────────────────────────────────────────────

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


# ─── Tags & Semantic Search endpoints moved to top ──────────────────


# ─── Manual Embedding Trigger ──────────────────────────────

@router.post("/{paper_id}/embed", status_code=202)
def embed_paper(paper_id: int, session: Session = Depends(get_session)) -> dict:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    content = session.exec(
        select(PaperContent).where(PaperContent.paper_id == paper_id)
    ).first()
    if content is None:
        raise HTTPException(status_code=400, detail="论文尚未解析，请先解析")

    from app.services.task_queue import BackgroundTaskQueue
    queue = BackgroundTaskQueue()

    def run_embed():
        from sqlmodel import Session as SyncSession
        from app.core.db import engine
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
