from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
from typing import Any

from app.models.subscription import Subscription

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(unescape(value).split())


def strip_html(value: str | None) -> str:
    return clean_text(_HTML_TAG_RE.sub(" ", value or ""))


def normalize_url(value: str | None) -> str:
    return (value or "").strip().rstrip("/")


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if abs(timestamp) > 10_000_000_000:
            timestamp /= 1000.0
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    try:
        return _ensure_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))
    except ValueError:
        pass

    try:
        return _ensure_utc(parsedate_to_datetime(text))
    except (TypeError, ValueError, IndexError):
        return None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_title(value: str) -> str:
    return " ".join(value.split()).casefold()


def _published_day(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        return value.date().isoformat()
    return value.astimezone(timezone.utc).date().isoformat()


@dataclass(slots=True)
class SourceCandidate:
    artifact_type: str
    source_kind: str
    external_id: str = ""
    title: str = ""
    authors: str = ""
    abstract_raw: str = ""
    canonical_url: str = ""
    pdf_url: str = ""
    published_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.external_id = clean_text(self.external_id)
        self.title = clean_text(self.title)
        self.authors = clean_text(self.authors)
        self.abstract_raw = strip_html(self.abstract_raw)
        self.canonical_url = normalize_url(self.canonical_url)
        self.pdf_url = normalize_url(self.pdf_url)
        self.metadata = dict(self.metadata or {})

    def fingerprint(self) -> str:
        for label, value in (
            ("external_id", self.external_id),
            ("pdf_url", self.pdf_url),
            ("canonical_url", self.canonical_url),
        ):
            if value:
                return sha256(f"{label}:{value}".encode("utf-8")).hexdigest()

        title_key = _normalize_title(self.title)
        date_key = _published_day(self.published_at)
        fallback = f"{title_key}|{date_key}" if title_key or date_key else f"{self.artifact_type}|{self.source_kind}"
        return sha256(f"title_date:{fallback}".encode("utf-8")).hexdigest()


class SourceAdapter(ABC):
    source_kind: str
    artifact_type: str = "paper"

    @abstractmethod
    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        raise NotImplementedError
