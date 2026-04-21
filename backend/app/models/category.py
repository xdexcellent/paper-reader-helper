from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(index=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="category.id")
    description: str = ""
    is_system: bool = True
    is_active: bool = True
    is_pending_bucket: bool = False
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
