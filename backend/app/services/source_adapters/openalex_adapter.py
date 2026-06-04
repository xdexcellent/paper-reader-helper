"""OpenAlex adapter — search papers via the OpenAlex API.

API docs: https://docs.openalex.org/
Free, no API key required. Just set a polite email in the User-Agent or mailto param.
No strict rate limits — just be respectful (~10 req/sec max).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable

from app.models.subscription import Subscription
from app.services.source_adapters.base import (
    SourceAdapter,
    SourceCandidate,
    clean_text,
    parse_datetime,
)

logger = logging.getLogger(__name__)

OPENALEX_WORKS_URL = "https://api.openalex.org/works"


class OpenAlexAdapter(SourceAdapter):
    source_kind = "openalex"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict, dict], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        query = subscription.query.strip()
        if not query:
            return []

        config = subscription.config
        params: dict[str, str | int] = {
            "search": query,
            "per_page": min(subscription.fetch_limit, 50),
            "sort": "relevance_score:desc",
        }

        # Optional filters
        filters: list[str] = ["type:article"]

        from_date = config.get("from_date")
        if from_date:
            filters.append(f"from_publication_date:{from_date}")

        to_date = config.get("to_date")
        if to_date:
            filters.append(f"to_publication_date:{to_date}")

        # Default: only recent papers (last 2 years) if no date filter
        if not from_date and not to_date:
            filters.append("from_publication_date:2024-01-01")

        open_access = config.get("open_access_only")
        if open_access:
            filters.append("is_oa:true")
            filters.append("best_oa_location.is_accepted:true")

        concept = config.get("concept")
        if concept:
            filters.append(f"topics.display_name.search:{concept}")

        if filters:
            params["filter"] = ",".join(filters)

        # Polite pool: include email for higher priority
        email = os.environ.get("OPENALEX_EMAIL", "")
        headers = {}
        if email:
            params["mailto"] = email
        else:
            headers["User-Agent"] = "PaperReaderHelper/1.0 (research tool)"

        payload = self._fetch_json(OPENALEX_WORKS_URL, params, headers)

        works = payload.get("results") or []
        candidates: list[SourceCandidate] = []

        for work in works[: subscription.fetch_limit]:
            openalex_id = work.get("id", "")
            doi = work.get("doi") or ""
            title = clean_text(work.get("title") or "")

            # Authors
            authorships = work.get("authorships") or []
            authors = ", ".join(
                clean_text(a.get("author", {}).get("display_name") or "")
                for a in authorships[:10]
                if a.get("author", {}).get("display_name")
            )

            # Abstract (OpenAlex uses inverted index format)
            abstract_inverted = work.get("abstract_inverted_index")
            abstract = ""
            if abstract_inverted and isinstance(abstract_inverted, dict):
                # Reconstruct abstract from inverted index
                word_positions: list[tuple[int, str]] = []
                for word, positions in abstract_inverted.items():
                    for pos in positions:
                        word_positions.append((pos, word))
                word_positions.sort(key=lambda x: x[0])
                abstract = " ".join(w for _, w in word_positions)

            # PDF URL
            pdf_url = ""
            best_oa = work.get("best_oa_location") or {}
            if best_oa.get("pdf_url"):
                pdf_url = best_oa["pdf_url"]
            elif best_oa.get("landing_page_url"):
                pdf_url = ""  # landing page, not direct PDF

            # Fallback: primary location
            if not pdf_url:
                primary = work.get("primary_location") or {}
                if primary.get("pdf_url"):
                    pdf_url = primary["pdf_url"]

            # Skip papers with PDF from known paywalled domains
            _PAYWALLED_DOMAINS = {
                'dl.acm.org',
                'ieeexplore.ieee.org',
                'www.sciencedirect.com',
                'link.springer.com/chapter',
                'onlinelibrary.wiley.com',
                'www.nature.com/articles',
                'journals.sagepub.com',
                'www.tandfonline.com',
                'academic.oup.com/journals',
            }
            if pdf_url and any(domain in pdf_url for domain in _PAYWALLED_DOMAINS):
                pdf_url = ""

            # Canonical URL
            canonical_url = ""
            if doi:
                canonical_url = doi if doi.startswith("http") else f"https://doi.org/{doi.replace('https://doi.org/', '')}"
            elif openalex_id:
                canonical_url = openalex_id

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=openalex_id.split("/")[-1] if openalex_id else "",
                    title=title,
                    authors=authors,
                    abstract_raw=clean_text(abstract),
                    canonical_url=canonical_url,
                    pdf_url=clean_text(pdf_url),
                    published_at=parse_datetime(work.get("publication_date")),
                    metadata={
                        "doi": doi,
                        "openalex_id": openalex_id,
                        "cited_by_count": work.get("cited_by_count", 0),
                        "type": work.get("type", ""),
                        "query": query,
                    },
                )
            )

        return candidates


def _default_fetch_json(url: str, params: dict, headers: dict) -> dict:
    from app.services.http_client_factory import fetch_with_retry

    try:
        response = fetch_with_retry(
            url, params=params, headers=headers, timeout=30, max_retries=2, backoff_seconds=2.0
        )
        return response.json()
    except Exception as exc:
        logger.warning("OpenAlex API error: %s", exc)
        raise
