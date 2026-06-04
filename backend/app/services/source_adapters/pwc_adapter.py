"""Papers With Code adapter — fetch papers via the PwC REST API.

API docs: https://paperswithcode.com/api/v1/
No API key required. Rate-limited but generous for typical usage.
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
)

logger = logging.getLogger(__name__)

PWC_API_BASE = "https://paperswithcode.com/api/v1"


class PapersWithCodeAdapter(SourceAdapter):
    source_kind = "pwc"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        config = subscription.config
        query = subscription.query.strip()

        # Determine endpoint: search by query, or list latest/trending
        mode = config.get("mode", "latest")  # "latest", "trending", "search"
        if query:
            mode = "search"

        params: dict[str, str | int] = {
            "items_per_page": min(subscription.fetch_limit, 50),
        }

        if mode == "search" and query:
            url = f"{PWC_API_BASE}/search/"
            params["q"] = query
        elif mode == "trending":
            url = f"{PWC_API_BASE}/papers/"
            params["ordering"] = "-trending_score"
        else:
            # Default: latest papers
            url = f"{PWC_API_BASE}/papers/"
            params["ordering"] = "-published"

        payload = self._fetch_json(url, params)

        # API returns {"results": [...]} for list endpoints
        # and {"results": [...]} for search as well
        results = payload.get("results") or []
        candidates: list[SourceCandidate] = []
        for item in results[: subscription.fetch_limit]:
            paper_id = clean_text(str(item.get("id") or item.get("paper_id") or ""))
            title = clean_text(str(item.get("title") or ""))
            abstract = clean_text(str(item.get("abstract") or ""))

            # Authors
            authors_list = item.get("authors") or []
            if isinstance(authors_list, list):
                authors = ", ".join(clean_text(str(a)) for a in authors_list if a)
            else:
                authors = clean_text(str(authors_list))

            # URLs
            url_abs = clean_text(str(item.get("url_abs") or ""))
            url_pdf = clean_text(str(item.get("url_pdf") or ""))
            paper_url = clean_text(str(item.get("paper_url") or ""))

            canonical_url = url_abs or paper_url
            if not canonical_url and paper_id:
                canonical_url = f"https://paperswithcode.com/paper/{paper_id}"

            # Try to get arxiv PDF if url_pdf is empty
            arxiv_id = clean_text(str(item.get("arxiv_id") or ""))
            if not url_pdf and arxiv_id:
                url_pdf = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=paper_id or arxiv_id,
                    title=title,
                    authors=authors,
                    abstract_raw=abstract,
                    canonical_url=canonical_url,
                    pdf_url=url_pdf,
                    published_at=parse_datetime(item.get("published") or item.get("date")),
                    metadata={
                        "arxiv_id": arxiv_id,
                        "stars": item.get("stars", 0),
                        "mode": mode,
                    },
                )
            )
        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    from app.services.http_client_factory import fetch_with_retry

    try:
        response = fetch_with_retry(url, params=params, timeout=30, max_retries=2, backoff_seconds=2.0)
        text = response.text.strip()
        if not text:
            logger.warning("Papers With Code returned empty response for url=%s", url)
            return {"results": []}
        try:
            return response.json()
        except Exception:
            # PwC 偶尔返回 HTML 错误页或空内容
            logger.warning(
                "Papers With Code returned non-JSON content (status=%d, len=%d): %s",
                response.status_code,
                len(text),
                text[:200],
            )
            return {"results": []}
    except Exception as exc:
        logger.warning("Papers With Code API error: %s", exc)
        raise
