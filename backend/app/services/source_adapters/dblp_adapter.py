"""DBLP adapter — search computer science publications via the DBLP API.

API docs: https://dblp.org/faq/How+to+use+the+dblp+search+API.html
No API key required. Public and free.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import (
    SourceAdapter,
    SourceCandidate,
    clean_text,
    parse_datetime,
)

logger = logging.getLogger(__name__)

DBLP_SEARCH_URL = "https://dblp.org/search/publ/api"
_ARXIV_ID_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,6})")


class DBLPAdapter(SourceAdapter):
    source_kind = "dblp"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        query = subscription.query.strip()
        if not query:
            return []

        config = subscription.config
        params: dict[str, str | int] = {
            "q": query,
            "format": "json",
            "h": min(subscription.fetch_limit, 100),  # max hits
        }

        # Optional: filter by type (Conference and Workshop Papers, Journal Articles, etc.)
        pub_type = config.get("type")
        if pub_type:
            params["type"] = str(pub_type)

        # Optional: filter by year
        year = config.get("year")
        if year:
            params["q"] = f"{query} year:{year}"

        payload = self._fetch_json(DBLP_SEARCH_URL, params)

        result = payload.get("result") or {}
        hits_wrapper = result.get("hits") or {}
        hits = hits_wrapper.get("hit") or []

        candidates: list[SourceCandidate] = []
        for hit in hits[: subscription.fetch_limit]:
            info = hit.get("info") or {}
            title = clean_text(str(info.get("title") or ""))
            # DBLP sometimes appends a trailing period to titles
            if title.endswith("."):
                title = title[:-1]

            # Authors
            authors_data = info.get("authors") or {}
            author_list = authors_data.get("author") or []
            if isinstance(author_list, dict):
                author_list = [author_list]
            authors = ", ".join(
                clean_text(str(a.get("text") or a.get("@text") or a)) for a in author_list if a
            )

            # URLs
            canonical_url = clean_text(str(info.get("url") or ""))
            ee_url = clean_text(str(info.get("ee") or ""))

            # Try to extract arXiv ID for PDF
            pdf_url = ""
            arxiv_match = _ARXIV_ID_RE.search(ee_url) if ee_url else None
            if arxiv_match:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_match.group(1)}.pdf"
            elif ee_url and ee_url.endswith(".pdf"):
                pdf_url = ee_url

            # External ID
            external_id = clean_text(str(info.get("key") or hit.get("@id") or ""))

            # Year as published_at
            year_str = str(info.get("year") or "")
            published_at = parse_datetime(f"{year_str}-01-01") if year_str.isdigit() else None

            venue = clean_text(str(info.get("venue") or ""))

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=external_id,
                    title=title,
                    authors=authors,
                    abstract_raw="",  # DBLP doesn't provide abstracts
                    canonical_url=ee_url or canonical_url,
                    pdf_url=pdf_url,
                    published_at=published_at,
                    metadata={
                        "venue": venue,
                        "dblp_key": external_id,
                        "type": info.get("type", ""),
                    },
                )
            )
        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    from app.services.http_client_factory import fetch_with_retry

    try:
        response = fetch_with_retry(url, params=params, timeout=30, max_retries=2, backoff_seconds=2.0)
        return response.json()
    except Exception as exc:
        logger.warning("DBLP API error: %s", exc)
        raise
