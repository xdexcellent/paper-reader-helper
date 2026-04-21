import json
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperEmbedding(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="paper.id", index=True)
    # Store embedding as JSON string to keep SQLite compatibility without relying on sqlite-vss
    embedding_json: str
    model_name: str = "BAAI/bge-m3"

    @property
    def vector(self) -> list[float]:
        return json.loads(self.embedding_json)

    @vector.setter
    def vector(self, val: list[float]):
        self.embedding_json = json.dumps(val)
