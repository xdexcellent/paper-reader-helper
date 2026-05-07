"""Zotero 导入：请求/响应 Pydantic 模式。"""

from pydantic import BaseModel


class ZoteroScanRequest(BaseModel):
    """Zotero 扫描请求：提供源文件路径。"""
    source_path: str


class ZoteroRunResponse(BaseModel):
    """Zotero 导入运行摘要。"""
    id: int
    source_fingerprint: str = ""
    status: str = ""
    imported_count: int = 0
    skipped_count: int = 0
    duplicate_count: int = 0
    warning_count: int = 0
    failed_count: int = 0
    error_message: str = ""
    created_at: str = ""
    updated_at: str = ""


class ZoteroCandidateResponse(BaseModel):
    """单个 Zotero 候选项详情。"""
    id: int
    import_run_id: int
    source_key: str = ""
    mapped_title: str = ""
    mapped_authors: str = ""
    mapped_year: int | None = None
    mapped_doi: str = ""
    mapped_url: str = ""
    mapped_venue: str = ""
    mapped_collections: list[str] = []
    mapped_tags: list[str] = []
    attachment_exists: bool = False
    is_duplicate: bool = False
    duplicate_of_paper_id: int | None = None
    duplicate_reason: str = ""
    is_selected: bool = True
    warning_message: str = ""
    import_status: str = "pending"


class ZoteroImportConfirm(BaseModel):
    """导入确认请求体。"""
    allow_metadata_only: bool = False


class CandidateSelectUpdate(BaseModel):
    """候选项选择状态更新。"""
    is_selected: bool
