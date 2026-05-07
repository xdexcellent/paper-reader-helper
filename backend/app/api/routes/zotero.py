"""Zotero 导入 API 路由。

提供：
- POST /zotero/import-runs/scan       扫描 Zotero 数据库，生成候选项
- GET  /zotero/import-runs/{run_id}   获取导入运行详情
- GET  /zotero/import-runs/{run_id}/candidates  获取候选项（可分页/过滤）
- PATCH /zotero/import-runs/{run_id}/candidates/{candidate_id}  更新选择状态
- POST /zotero/import-runs/{run_id}/import  执行导入
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.auth import get_current_user
from app.core.db import get_session
from app.models.zotero_import_candidate import ZoteroImportCandidate
from app.models.zotero_import_run import ZoteroImportRun
from app.schemas.zotero import (
    CandidateSelectUpdate,
    ZoteroCandidateResponse,
    ZoteroImportConfirm,
    ZoteroRunResponse,
    ZoteroScanRequest,
)
from app.services.zotero_import_service import ZoteroImportService
from app.services.zotero_mapping_service import ZoteroMappingService
from app.services.zotero_source_service import ZoteroSourceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/zotero", tags=["zotero"])


def _run_to_response(run: ZoteroImportRun) -> ZoteroRunResponse:
    """将 ORM 对象转换为响应 schema。"""
    return ZoteroRunResponse(
        id=run.id or 0,
        source_fingerprint=run.source_fingerprint or "",
        status=run.status or "",
        imported_count=run.imported_count,
        skipped_count=run.skipped_count,
        duplicate_count=run.duplicate_count,
        warning_count=run.warning_count,
        failed_count=run.failed_count,
        error_message=run.error_message or "",
        created_at=run.created_at.isoformat() if run.created_at else "",
        updated_at=run.updated_at.isoformat() if run.updated_at else "",
    )


def _candidate_to_response(c: ZoteroImportCandidate) -> ZoteroCandidateResponse:
    """将 ORM 对象转换为响应 schema。"""
    try:
        collections = json.loads(c.mapped_collections_json)
    except (json.JSONDecodeError, TypeError):
        collections = []

    try:
        tags = json.loads(c.mapped_tags_json)
    except (json.JSONDecodeError, TypeError):
        tags = []

    return ZoteroCandidateResponse(
        id=c.id or 0,
        import_run_id=c.import_run_id,
        source_key=c.source_key or "",
        mapped_title=c.mapped_title or "",
        mapped_authors=c.mapped_authors or "",
        mapped_year=c.mapped_year,
        mapped_doi=c.mapped_doi or "",
        mapped_url=c.mapped_url or "",
        mapped_venue=c.mapped_venue or "",
        mapped_collections=collections,
        mapped_tags=tags,
        attachment_exists=c.attachment_exists,
        is_duplicate=c.is_duplicate,
        duplicate_of_paper_id=c.duplicate_of_paper_id,
        duplicate_reason=c.duplicate_reason or "",
        is_selected=c.is_selected,
        warning_message=c.warning_message or "",
        import_status=c.import_status or "pending",
    )


@router.post("/import-runs/scan", response_model=ZoteroRunResponse)
def scan_zotero_source(
    body: ZoteroScanRequest,
    session: Session = Depends(get_session),
    _user: str = Depends(get_current_user),
) -> ZoteroRunResponse:
    """扫描 Zotero 数据库源文件。"""
    source_service = ZoteroSourceService()
    mapping_service = ZoteroMappingService()
    import_service = ZoteroImportService()

    # 1. 验证源文件
    validation = source_service.validate_source(body.source_path)
    if not validation["valid"]:
        raise HTTPException(
            status_code=422,
            detail=validation["error"] or "无效的 Zotero 源文件",
        )

    fingerprint = validation["fingerprint"]

    # 2. 创建导入运行记录
    now = datetime.now(timezone.utc)
    run = ZoteroImportRun(
        source_fingerprint=fingerprint,
        status="scanning",
        created_at=now,
        updated_at=now,
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    # 3. 复制到临时目录并以只读模式打开
    try:
        temp_path = source_service.create_temp_copy(body.source_path)
    except (OSError, FileNotFoundError) as e:
        run.status = "failed"
        run.error_message = f"无法复制源文件: {e}"
        session.add(run)
        session.commit()
        return _run_to_response(run)

    try:
        conn = source_service.open_read_only(temp_path)
    except Exception as e:
        run.status = "failed"
        run.error_message = f"无法打开数据库: {e}"
        session.add(run)
        session.commit()
        source_service.cleanup_temp_copy(temp_path)
        return _run_to_response(run)

    try:
        # 4. 扫描条目
        items = mapping_service.scan_items(conn)
        mapped_items = []
        for item in items:
            mapped = mapping_service.map_candidate(item)
            item["_mapped"] = mapped
            mapped_items.append(item)

        # 5. 构建候选项
        import_service.build_candidates(session, run, mapped_items)

        run.status = "ready"
        session.add(run)
        session.commit()
    except Exception as e:
        logger.exception("扫描 Zotero 数据库失败")
        run.status = "failed"
        run.error_message = f"扫描数据库失败: {e}"
        session.add(run)
        session.commit()
    finally:
        conn.close()
        source_service.cleanup_temp_copy(temp_path)

    session.refresh(run)
    return _run_to_response(run)


@router.get("/import-runs/{run_id}", response_model=ZoteroRunResponse)
def get_import_run(
    run_id: int,
    session: Session = Depends(get_session),
    _user: str = Depends(get_current_user),
) -> ZoteroRunResponse:
    """获取导入运行详情。"""
    run = session.get(ZoteroImportRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="导入运行记录不存在")
    return _run_to_response(run)


@router.get("/import-runs/{run_id}/candidates", response_model=list[ZoteroCandidateResponse])
def list_candidates(
    run_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    collection: str = Query(default=""),
    tag: str = Query(default=""),
    attachment_status: str = Query(default="all"),
    duplicate_status: str = Query(default="all"),
    warning_status: str = Query(default="all"),
    session: Session = Depends(get_session),
    _user: str = Depends(get_current_user),
) -> list[ZoteroCandidateResponse]:
    """分页/过滤获取候选项列表。"""
    run = session.get(ZoteroImportRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="导入运行记录不存在")

    stmt = select(ZoteroImportCandidate).where(
        ZoteroImportCandidate.import_run_id == run_id
    )

    # 数据库层面过滤：先查所有，再在 Python 中过滤
    all_candidates = session.exec(stmt).all()

    # 过滤
    filtered = all_candidates
    collection_lower = collection.strip().lower()
    tag_lower = tag.strip().lower()

    if collection_lower:
        filtered = [
            c for c in filtered
            if any(
                col.lower() == collection_lower
                or collection_lower in col.lower()
                for col in _safe_json_list(c.mapped_collections_json)
            )
        ]

    if tag_lower:
        filtered = [
            c for c in filtered
            if any(
                t.lower() == tag_lower or tag_lower in t.lower()
                for t in _safe_json_list(c.mapped_tags_json)
            )
        ]

    if attachment_status == "with_attachment":
        filtered = [c for c in filtered if c.attachment_exists]
    elif attachment_status == "without_attachment":
        filtered = [c for c in filtered if not c.attachment_exists]

    if duplicate_status == "duplicate":
        filtered = [c for c in filtered if c.is_duplicate]
    elif duplicate_status == "unique":
        filtered = [c for c in filtered if not c.is_duplicate]

    if warning_status == "warning":
        filtered = [c for c in filtered if c.warning_message]
    elif warning_status == "no_warning":
        filtered = [c for c in filtered if not c.warning_message]

    # 分页
    paged = filtered[offset : offset + limit]
    return [_candidate_to_response(c) for c in paged]


@router.patch(
    "/import-runs/{run_id}/candidates/{candidate_id}",
    response_model=ZoteroCandidateResponse,
)
def update_candidate_selection(
    run_id: int,
    candidate_id: int,
    body: CandidateSelectUpdate,
    session: Session = Depends(get_session),
    _user: str = Depends(get_current_user),
) -> ZoteroCandidateResponse:
    """更新候选项的选择状态。"""
    candidate = session.get(ZoteroImportCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="候选项不存在")
    if candidate.import_run_id != run_id:
        raise HTTPException(status_code=400, detail="候选项不属于指定的导入运行")

    candidate.is_selected = body.is_selected
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return _candidate_to_response(candidate)


@router.post("/import-runs/{run_id}/import", response_model=ZoteroRunResponse)
def import_candidates(
    run_id: int,
    body: ZoteroImportConfirm = ZoteroImportConfirm(),
    session: Session = Depends(get_session),
    _user: str = Depends(get_current_user),
) -> ZoteroRunResponse:
    """执行导入：导入所有选定的候选项。"""
    run = session.get(ZoteroImportRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="导入运行记录不存在")
    if run.status not in ("ready", "completed"):
        raise HTTPException(status_code=400, detail="导入运行尚未就绪，请等待扫描完成")

    import_service = ZoteroImportService()

    # 获取所有选定的候选项 ID
    candidates = session.exec(
        select(ZoteroImportCandidate).where(
            ZoteroImportCandidate.import_run_id == run_id,
            ZoteroImportCandidate.is_selected == True,  # noqa: E712
        )
    ).all()

    candidate_ids = [c.id for c in candidates if c.id is not None]

    result = import_service.import_candidates(
        session, run, candidate_ids, body.allow_metadata_only
    )

    logger.info(
        "Zotero 导入完成: imported=%d, skipped=%d, failed=%d",
        result["imported"],
        result["skipped"],
        result["failed"],
    )

    session.refresh(run)
    return _run_to_response(run)


def _safe_json_list(json_str: str) -> list[str]:
    """安全解析 JSON 字符串为列表。"""
    try:
        data = json.loads(json_str)
        if isinstance(data, list):
            return [str(item) for item in data]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
