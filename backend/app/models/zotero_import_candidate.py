from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ZoteroImportCandidate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    import_run_id: int = Field(index=True, foreign_key="zoteroimportrun.id")
    source_key: str = Field(index=True)
    zotero_item_type: str = ""
    raw_title: str = ""
    mapped_title: str = ""
    mapped_authors: str = ""
    mapped_year: Optional[int] = None
    mapped_doi: str = ""
    mapped_url: str = ""
    mapped_venue: str = ""
    mapped_abstract_note: str = ""
    mapped_publication_title: str = ""
    mapped_collections_json: str = "[]"
    mapped_tags_json: str = "[]"
    attachment_path: str = ""
    attachment_exists: bool = False
    is_duplicate: bool = False
    duplicate_of_paper_id: Optional[int] = Field(default=None, foreign_key="paper.id")
    duplicate_reason: str = ""
    is_selected: bool = True
    warning_message: str = ""
    import_status: str = Field(default="pending", index=True)
    imported_paper_id: Optional[int] = Field(default=None, foreign_key="paper.id")
    import_error: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
