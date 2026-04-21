import json
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Subscription(SQLModel, table=True):
    __tablename__ = "subscription"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str = "arxiv"  # 'arxiv' or 'rss'
    source_kind: str = "arxiv"
    display_name: str = ""
    query: str = ""  # arXiv search query or RSS URL
    config_json: str = "{}"
    fetch_limit: int = 10
    is_active: bool = True
    last_checked_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def config(self) -> dict:
        try:
            return json.loads(self.config_json or "{}")
        except (json.JSONDecodeError, TypeError):
            return {}

    @config.setter
    def config(self, value: dict) -> None:
        self.config_json = json.dumps(value or {}, ensure_ascii=False)
