"""Unpaywall adapter — find open access PDF URLs for papers by DOI.

API docs: https://unpaywall.org/products/api
Free, requires email as identifier. No API key needed.
Rate limit: 100,000 requests/day.

This adapter is different from others: it doesn't search for papers.
Instead, it enriches existing papers with PDF download URLs.
It can also be used as a subscription source that searches by DOI list.
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

UNPAYWALL_API_URL = "https://api.unpaywall.org/v2"


class UnpaywallAdapter(SourceAdapter):
    source_kind = "unpaywall"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        """Fetch papers by DOI list from subscription query.

        The query field should contain DOIs separated by newlines or commas.
        This adapter looks up each DOI on Unpaywall to find OA PDF URLs.
        """
        query = subscription.query.strip()
        if not query:
            return []

        # Parse DOIs from query (newline or comma separated)
        dois = [
            doi.strip()
            for doi in query.replace(",", "\n").split("\n")
            if doi.strip()
        ]

        if not dois:
            return []

        email = os.environ.get("UNPAYWALL_EMAIL") or os.environ.get("OPENALEX_EMAIL") or "user@example.com"
        candidates: list[SourceCandidate] = []

        for doi in dois[: subscription.fetch_limit]:
            # Clean DOI
            clean_doi = doi.strip()
            if clean_doi.startswith("https://doi.org/"):
                clean_doi = clean_doi[len("https://doi.org/"):]
            elif clean_doi.startswith("http://doi.org/"):
                clean_doi = clean_doi[len("http://doi.org/"):]

            if not clean_doi:
                continue

            try:
                url = f"{UNPAYWALL_API_URL}/{clean_doi}"
                params = {"email": email}
                data = self._fetch_json(url, params)
            except Exception as exc:
                logger.warning("Unpaywall lookup failed for DOI %s: %s", clean_doi, exc)
                continue

            if not data or data.get("error"):
                continue

            # Extract best OA location
            best_oa = data.get("best_oa_location") or {}
            pdf_url = best_oa.get("url_for_pdf") or best_oa.get("url") or ""

            # Authors
            authors_list = data.get("z_authors") or []
            authors = ", ".join(
                clean_text(f"{a.get('given', '')} {a.get('family', '')}".strip())
                for a in authors_list[:10]
                if a.get("family")
            )

            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=clean_doi,
                    title=clean_text(data.get("title") or ""),
                    authors=authors,
                    abstract_raw="",  # Unpaywall doesn't provide abstracts
                    canonical_url=f"https://doi.org/{clean_doi}",
                    pdf_url=clean_text(pdf_url),
                    published_at=parse_datetime(data.get("published_date")),
                    metadata={
                        "doi": clean_doi,
                        "journal": data.get("journal_name", ""),
                        "publisher": data.get("publisher", ""),
                        "is_oa": data.get("is_oa", False),
                        "oa_status": data.get("oa_status", ""),
                    },
                )
            )

        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    from app.services.http_client_factory import fetch_with_retry

    try:
        response = fetch_with_retry(
            url, params=params, timeout=20, max_retries=2, backoff_seconds=1.0
        )
        return response.json()
    except Exception as exc:
        logger.warning("Unpaywall API error: %s", exc)
        raise
