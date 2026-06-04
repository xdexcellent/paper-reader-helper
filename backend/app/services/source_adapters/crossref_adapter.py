"""CrossRef adapter — search scholarly publications via the CrossRef API.

API docs: https://api.crossref.org/swagger-ui/index.html
No API key required (polite pool with mailto gets better rate limits).
Covers millions of DOI-registered papers across all disciplines.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import (
    SourceAdapter,
    SourceCandidate,
    clean_text,
    parse_datetime,
    strip_html,
)

logger = logging.getLogger(__name__)

CROSSREF_WORKS_URL = "https://api.crossref.org/works"


class CrossRefAdapter(SourceAdapter):
    source_kind = "crossref"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict, dict[str, str] | None], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        query = subscription.query.strip()
        if not query:
            return []

        config = subscription.config
        params: dict[str, str | int] = {
            "query": query,
            "rows": min(subscription.fetch_limit, 100),
            "sort": config.get("sort", "published"),
            "order": config.get("order", "desc"),
        }

        # Optional filters
        from_date = config.get("from_date")
        if from_date:
            params["filter"] = f"from-pub-date:{from_date}"

        # Use mailto for polite pool (better rate limits)
        headers: dict[str, str] | None = None
        mailto = config.get("mailto")
        if mailto:
            headers = {"User-Agent": f"PaperReaderHelper/1.0 (mailto:{mailto})"}

        payload = self._fetch_json(CROSSREF_WORKS_URL, params, headers)

        message = payload.get("message") or {}
        items = message.get("items") or []

        candidates: list[SourceCandidate] = []
        for item in items[: subscription.fetch_limit]:
            # Title
            title_list = item.get("title") or []
            title = clean_text(str(title_list[0])) if title_list else ""

            # Authors
            authors_list = item.get("author") or []
            authors = ", ".join(
                clean_text(f"{a.get('given', '')} {a.get('family', '')}".strip())
                for a in authors_list
                if a.get("family")
            )

            # Abstract (some CrossRef records include it)
            abstract = strip_html(str(item.get("abstract") or ""))

            # DOI and URLs
            doi = clean_text(str(item.get("DOI") or ""))
            canonical_url = f"https://doi.org/{doi}" if doi else ""

            # Look for open-access PDF link
            pdf_url = ""
            links = item.get("link") or []
            for link in links:
                content_type = str(link.get("content-type") or "")
                if "pdf" in content_type:
                    pdf_url = clean_text(str(link.get("URL") or ""))
                    break

            # Published date
            pub_date_parts = item.get("published") or item.get("published-print") or item.get("published-online") or {}
            date_parts = pub_date_parts.get("date-parts", [[]])
            published_at = _date_parts_to_datetime(date_parts[0] if date_parts else [])

            # Container (journal/conference name)
            container = item.get("container-title") or []
            venue = clean_text(str(container[0])) if container else ""

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=doi,
                    title=title,
                    authors=authors,
                    abstract_raw=abstract,
                    canonical_url=canonical_url,
                    pdf_url=pdf_url,
                    published_at=published_at,
                    metadata={
                        "doi": doi,
                        "venue": venue,
                        "type": item.get("type", ""),
                        "is_referenced_by_count": item.get("is-referenced-by-count", 0),
                    },
                )
            )
        return candidates


def _date_parts_to_datetime(parts: list):
    """Convert CrossRef date-parts [year, month, day] to ISO string for parsing."""
    if not parts:
        return None
    year = parts[0] if len(parts) > 0 else None
    month = parts[1] if len(parts) > 1 else 1
    day = parts[2] if len(parts) > 2 else 1
    if not year:
        return None
    return parse_datetime(f"{year:04d}-{month:02d}-{day:02d}")


def _default_fetch_json(url: str, params: dict, headers: dict[str, str] | None = None) -> dict:
    from app.services.http_client_factory import fetch_with_retry

    try:
        response = fetch_with_retry(
            url, params=params, headers=headers, timeout=30, max_retries=2, backoff_seconds=2.0
        )
        return response.json()
    except Exception as exc:
        logger.warning("CrossRef API error: %s", exc)
        raise
