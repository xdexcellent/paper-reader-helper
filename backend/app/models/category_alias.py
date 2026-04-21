from typing import Optional

from sqlmodel import Field, SQLModel


class CategoryAlias(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(index=True, foreign_key="category.id")
    alias: str
    normalized_alias: str = Field(index=True)
