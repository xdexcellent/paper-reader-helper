from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ZoteroImportRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_fingerprint: str = Field(index=True)
    status: str = Field(default="scanning", index=True)
    imported_count: int = 0
    skipped_count: int = 0
    duplicate_count: int = 0
    warning_count: int = 0
    failed_count: int = 0
    error_message: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
