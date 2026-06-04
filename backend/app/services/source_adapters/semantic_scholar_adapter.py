"""Semantic Scholar adapter — search papers via the public S2 API.

API docs: https://api.semanticscholar.org/api-docs/graph
No API key required for basic usage, but the public pool is strict
(~1 req/sec, bursts trigger 429). We add a process-wide throttle.
"""

from __future__ import annotations

import logging
import threading
import time
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

S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_FIELDS = "paperId,title,authors,abstract,url,openAccessPdf,publicationDate,externalIds"

# Process-wide rate limiter for Semantic Scholar:
# unauthenticated quota is roughly 1 request/second.
_S2_LOCK = threading.Lock()
_S2_LAST_CALL: dict[str, float] = {"t": 0.0}
_S2_MIN_INTERVAL = 1.5  # seconds between calls


class SemanticScholarAdapter(SourceAdapter):
    source_kind = "semantic_scholar"
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
            "query": query,
            "limit": min(subscription.fetch_limit, 100),
            "fields": S2_FIELDS,
        }

        # Optional filters
        year = config.get("year")
        if year:
            params["year"] = str(year)

        venue = config.get("venue")
        if venue:
            params["venue"] = str(venue)

        fields_of_study = config.get("fields_of_study")
        if fields_of_study:
            params["fieldsOfStudy"] = str(fields_of_study)

        open_access_only = config.get("open_access_only")
        if open_access_only:
            params["openAccessPdf"] = ""

        payload = self._fetch_json(S2_SEARCH_URL, params)

        papers = payload.get("data") or []
        candidates: list[SourceCandidate] = []
        for paper in papers[: subscription.fetch_limit]:
            paper_id = clean_text(str(paper.get("paperId") or ""))
            external_ids = paper.get("externalIds") or {}
            arxiv_id = external_ids.get("ArXiv", "")

            # Build PDF URL: prefer openAccessPdf, fallback to arXiv
            oa_pdf = paper.get("openAccessPdf") or {}
            pdf_url = clean_text(str(oa_pdf.get("url") or ""))
            if not pdf_url and arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

            authors_list = paper.get("authors") or []
            authors = ", ".join(
                clean_text(str(a.get("name") or "")) for a in authors_list if a.get("name")
            )

            canonical_url = clean_text(str(paper.get("url") or ""))
            if not canonical_url and paper_id:
                canonical_url = f"https://www.semanticscholar.org/paper/{paper_id}"

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=paper_id,
                    title=clean_text(str(paper.get("title") or "")),
                    authors=authors,
                    abstract_raw=clean_text(str(paper.get("abstract") or "")),
                    canonical_url=canonical_url,
                    pdf_url=pdf_url,
                    published_at=parse_datetime(paper.get("publicationDate")),
                    metadata={
                        "arxiv_id": arxiv_id,
                        "doi": external_ids.get("DOI", ""),
                        "query": query,
                    },
                )
            )
        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    import os
    from app.services.http_client_factory import fetch_with_retry

    # 进程级速率限制：两次 S2 请求之间保证至少 1.5 秒间隔
    with _S2_LOCK:
        now = time.time()
        elapsed = now - _S2_LAST_CALL["t"]
        if elapsed < _S2_MIN_INTERVAL:
            wait = _S2_MIN_INTERVAL - elapsed
            logger.debug("S2 throttle: sleeping %.2fs", wait)
            time.sleep(wait)
        _S2_LAST_CALL["t"] = time.time()

    # Use API key if available (greatly increases rate limits)
    headers: dict[str, str] = {}
    api_key = os.environ.get("S2_API_KEY") or os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key

    try:
        # 加长重试间隔，429 后等更久
        response = fetch_with_retry(
            url, params=params, headers=headers, timeout=30, max_retries=3, backoff_seconds=5.0
        )
        return response.json()
    except Exception as exc:
        logger.warning("Semantic Scholar API error: %s", exc)
        raise
