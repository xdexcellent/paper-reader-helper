from typing import Optional

from sqlmodel import Field, SQLModel


class PaperContent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, unique=True, foreign_key="paper.id")
    full_markdown: str = ""
    abstract_md: str = ""
    introduction_md: str = ""
    method_md: str = ""
    conclusion_md: str = ""
    content_json_path: str = ""
    full_zip_path: str = ""
    block_extraction_error: str = ""
