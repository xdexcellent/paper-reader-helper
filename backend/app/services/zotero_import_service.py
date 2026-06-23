"""Zotero 候选项构建、去重和导入服务。"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.models.paper import Paper, PaperStatus
from app.models.zotero_import_candidate import ZoteroImportCandidate
from app.models.zotero_import_run import ZoteroImportRun
from app.services.storage import StorageService
from app.services.venue_rank_service import apply_system_rank

logger = logging.getLogger(__name__)


class ZoteroImportService:
    """Zotero 候选项构建、去重、导入一体化服务。"""

    def __init__(self, storage: StorageService | None = None) -> None:
        self.storage = storage or StorageService()

    def build_candidates(
        self, session: Session, run: ZoteroImportRun, items: list[dict]
    ) -> list[ZoteroImportCandidate]:
        """为每个 Zotero 条目创建候选项记录并检测重复。

        返回创建的 ZoteroImportCandidate 列表。
        """
        candidates: list[ZoteroImportCandidate] = []
        for item in items:
            mapped = item.get("_mapped", {}) or item

            is_dup, dup_paper_id, dup_reason = self.detect_duplicates(
                session, mapped
            )

            # 默认选中：非重复且无严重警告
            is_selected = True
            if is_dup:
                is_selected = False
            if mapped.get("warning_message") and "不支持" in mapped.get("warning_message", ""):
                is_selected = False

            candidate = ZoteroImportCandidate(
                import_run_id=run.id,
                source_key=mapped.get("source_key", ""),
                zotero_item_type=mapped.get("zotero_item_type", ""),
                raw_title=mapped.get("mapped_title", ""),
                mapped_title=mapped.get("mapped_title", ""),
                mapped_authors=mapped.get("mapped_authors", ""),
                mapped_year=mapped.get("mapped_year"),
                mapped_doi=mapped.get("mapped_doi", ""),
                mapped_url=mapped.get("mapped_url", ""),
                mapped_venue=mapped.get("mapped_venue", ""),
                mapped_abstract_note=mapped.get("mapped_abstract_note", ""),
                mapped_publication_title=mapped.get("mapped_publication_title", ""),
                mapped_collections_json=json.dumps(
                    mapped.get("mapped_collections", []), ensure_ascii=False
                ),
                mapped_tags_json=json.dumps(
                    mapped.get("mapped_tags", []), ensure_ascii=False
                ),
                attachment_path=mapped.get("attachment_path", ""),
                attachment_exists=False,  # 导入时再检查
                is_duplicate=is_dup,
                duplicate_of_paper_id=dup_paper_id,
                duplicate_reason=dup_reason,
                is_selected=is_selected,
                warning_message=mapped.get("warning_message", ""),
                import_status="pending",
            )

            session.add(candidate)
            candidates.append(candidate)

        session.commit()

        # 刷新以获取 ID
        for c in candidates:
            session.refresh(c)

        # 更新 run 的计数
        self._update_run_counts(session, run)
        return candidates

    def detect_duplicates(
        self, session: Session, candidate: dict
    ) -> tuple[bool, int | None, str]:
        """检测候选项与已有论文的重复。

        返回 (is_duplicate, existing_paper_id, reason)。

        匹配规则（按优先级）：
        1. DOI 匹配：规范化后相等
        2. 标题匹配：不区分大小写，去除标点符号，去除空格
        3. URL 匹配：完全相等
        """
        doi = (candidate.get("mapped_doi") or "").strip()
        title = (candidate.get("mapped_title") or "").strip()
        url = (candidate.get("mapped_url") or "").strip()

        # 规则 1: DOI 匹配
        if doi:
            normalized_doi = self._normalize_doi(doi)
            existing = session.exec(
                select(Paper).where(Paper.doi != "")
            ).all()
            for p in existing:
                if self._normalize_doi(p.doi) == normalized_doi:
                    return True, p.id, f"DOI 匹配: {doi}"

        # 规则 2: 标题匹配
        if title:
            normalized_title = self._normalize_title(title)
            if normalized_title:
                existing = session.exec(
                    select(Paper).where(Paper.title != "")
                ).all()
                for p in existing:
                    if self._normalize_title(p.title) == normalized_title:
                        return True, p.id, f"标题匹配: {title[:50]}"

        # 规则 3: URL 匹配
        if url and url.startswith(("http://", "https://")):
            existing = session.exec(
                select(Paper).where(Paper.url == url)
            ).all()
            if existing:
                return True, existing[0].id, f"URL 匹配: {url}"

        return False, None, ""

    def import_candidates(
        self,
        session: Session,
        run: ZoteroImportRun,
        candidate_ids: list[int],
        allow_metadata_only: bool = False,
    ) -> dict:
        """导入选定的候选项。

        参数：
        - session: 数据库会话
        - run: 导入运行记录
        - candidate_ids: 要导入的候选项 ID 列表
        - allow_metadata_only: 是否允许无附件的条目导入

        返回 dict: {
            "imported": int, "skipped": int, "failed": int,
            "details": [{"candidate_id": int, "status": str, "paper_id": int|None, "error": str}]
        }
        """
        result: dict[str, Any] = {
            "imported": 0,
            "skipped": 0,
            "failed": 0,
            "details": [],
        }

        for cid in candidate_ids:
            candidate = session.get(ZoteroImportCandidate, cid)
            if not candidate:
                result["details"].append({
                    "candidate_id": cid,
                    "status": "failed",
                    "paper_id": None,
                    "error": "候选项不存在",
                })
                result["failed"] += 1
                continue

            # 跳过未选中
            if not candidate.is_selected:
                candidate.import_status = "skipped"
                result["skipped"] += 1
                result["details"].append({
                    "candidate_id": cid,
                    "status": "skipped",
                    "paper_id": None,
                    "error": "未选中",
                })
                session.add(candidate)
                continue

            # 跳过重复
            if candidate.is_duplicate:
                candidate.import_status = "skipped"
                result["skipped"] += 1
                result["details"].append({
                    "candidate_id": cid,
                    "status": "skipped",
                    "paper_id": None,
                    "error": f"重复({candidate.duplicate_reason})",
                })
                session.add(candidate)
                continue

            try:
                paper = self._create_paper_from_candidate(
                    session, candidate, allow_metadata_only
                )
                if paper is None:
                    candidate.import_status = "skipped"
                    result["skipped"] += 1
                    result["details"].append({
                        "candidate_id": cid,
                        "status": "skipped",
                        "paper_id": None,
                        "error": "无附件且不允许仅元数据导入",
                    })
                else:
                    candidate.import_status = "imported"
                    candidate.imported_paper_id = paper.id
                    result["imported"] += 1
                    result["details"].append({
                        "candidate_id": cid,
                        "status": "imported",
                        "paper_id": paper.id,
                        "error": "",
                    })
            except Exception as e:
                logger.exception("导入候选项失败 candidate_id=%s", cid)
                candidate.import_status = "failed"
                candidate.import_error = str(e)
                result["failed"] += 1
                result["details"].append({
                    "candidate_id": cid,
                    "status": "failed",
                    "paper_id": None,
                    "error": str(e),
                })

            session.add(candidate)

        session.commit()

        # 更新 run 计数
        self._update_run_counts(session, run)
        run.status = "completed"
        session.add(run)
        session.commit()

        return result

    def _create_paper_from_candidate(
        self,
        session: Session,
        candidate: ZoteroImportCandidate,
        allow_metadata_only: bool,
    ) -> Paper | None:
        """从候选项创建 Paper 记录。

        返回创建的 Paper 对象，或 None（被跳过时）。
        """
        now = datetime.now(timezone.utc)

        # 解析 tags
        try:
            tags = json.loads(candidate.mapped_tags_json)
        except (json.JSONDecodeError, TypeError):
            tags = []

        # 处理 PDF 附件
        local_pdf_path = ""
        if candidate.attachment_path:
            attachment_path = candidate.attachment_path

            # Zotero 存储格式: "storage:filename.pdf" 或 "attach:filename.pdf"
            if attachment_path.startswith("storage:"):
                # 相对存储路径——无法自动解析绝对路径，标记为无附件
                candidate.warning_message = (
                    (candidate.warning_message + "; " if candidate.warning_message else "")
                    + "附件使用 Zotero 相对存储路径，无法自动导入 PDF"
                )
                candidate.attachment_exists = False
            elif attachment_path.startswith("attach:"):
                candidate.warning_message = (
                    (candidate.warning_message + "; " if candidate.warning_message else "")
                    + "附件为链接文件，无法自动导入 PDF"
                )
                candidate.attachment_exists = False
            else:
                # 绝对路径或可访问路径
                src_path = Path(attachment_path)
                if src_path.is_file():
                    try:
                        local_pdf_path = self.storage.import_pdf(str(src_path))
                        candidate.attachment_exists = True
                    except Exception as e:
                        logger.warning("附件导入失败: %s", e)
                        candidate.warning_message = (
                            (candidate.warning_message + "; " if candidate.warning_message else "")
                            + f"附件导入失败: {e}"
                        )
                        candidate.attachment_exists = False
                else:
                    candidate.warning_message = (
                        (candidate.warning_message + "; " if candidate.warning_message else "")
                        + "附件文件不存在"
                    )
                    candidate.attachment_exists = False

        # 无附件处理
        if not local_pdf_path and not allow_metadata_only:
            return None  # 跳过

        paper = Paper(
            source="zotero",
            source_id=candidate.source_key,
            title=candidate.mapped_title or "无标题",
            authors=candidate.mapped_authors or "",
            abstract_raw=candidate.mapped_abstract_note or "",
            local_pdf_path=local_pdf_path or "",
            year=candidate.mapped_year,
            venue=candidate.mapped_venue or "",
            doi=candidate.mapped_doi or "",
            url=candidate.mapped_url or "",
            status=PaperStatus.QUEUED,
            tags_json=json.dumps(tags, ensure_ascii=False),
            created_at=now,
            updated_at=now,
        )
        apply_system_rank(paper)
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper

    def _update_run_counts(self, session: Session, run: ZoteroImportRun) -> None:
        """根据候选项更新 run 的计数统计。"""
        candidates = session.exec(
            select(ZoteroImportCandidate).where(
                ZoteroImportCandidate.import_run_id == run.id
            )
        ).all()

        run.imported_count = sum(1 for c in candidates if c.import_status == "imported")
        run.skipped_count = sum(1 for c in candidates if c.import_status == "skipped")
        run.duplicate_count = sum(1 for c in candidates if c.is_duplicate)
        run.warning_count = sum(1 for c in candidates if c.warning_message)
        run.failed_count = sum(1 for c in candidates if c.import_status == "failed")
        run.updated_at = datetime.now(timezone.utc)
        session.add(run)

    @staticmethod
    def _normalize_doi(doi: str) -> str:
        """规范化 DOI：去除前缀和尾部空格，统一小写。"""
        doi = doi.strip().lower()
        for prefix in ("https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/"):
            if doi.startswith(prefix):
                doi = doi[len(prefix):]
                break
        return doi.strip()

    @staticmethod
    def _normalize_title(title: str) -> str:
        """规范化标题：小写、去标点、去多余空格。"""
        title = title.strip().lower()
        # 去掉所有标点符号（保留字母、数字、空格）
        title = re.sub(r"[^\w\s]", "", title)
        # 合并多余空格
        title = re.sub(r"\s+", " ", title).strip()
        return title
