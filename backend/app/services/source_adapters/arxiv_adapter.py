from __future__ import annotations

import logging
from collections.abc import Callable

from app.models.subscription import Subscription
from app.services.arxiv_client import search_arxiv
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, parse_datetime

logger = logging.getLogger(__name__)


class ArxivAdapter(SourceAdapter):
    source_kind = "arxiv"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        search_fn: Callable[[str, int], list[dict]] = search_arxiv,
    ) -> None:
        self._search_fn = search_fn

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        query = subscription.query.strip()
        if not query:
            return []

        try:
            papers = self._search_fn(query, subscription.fetch_limit)
        except Exception:
            logger.exception("arXiv adapter fetch failed for query %s", query)
            return []

        candidates: list[SourceCandidate] = []
        for paper in papers[: subscription.fetch_limit]:
            external_id = str(paper.get("arxiv_id") or "").strip()
            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=external_id,
                    title=str(paper.get("title") or ""),
                    authors=str(paper.get("authors") or ""),
                    abstract_raw=str(paper.get("abstract") or ""),
                    canonical_url=str(paper.get("canonical_url") or _build_abs_url(external_id)),
                    pdf_url=str(paper.get("pdf_url") or _build_pdf_url(external_id)),
                    published_at=parse_datetime(paper.get("published")),
                    metadata={"query": query},
                )
            )
        return candidates


def _build_abs_url(arxiv_id: str) -> str:
    if not arxiv_id:
        return ""
    return f"https://arxiv.org/abs/{arxiv_id}"


def _build_pdf_url(arxiv_id: str) -> str:
    if not arxiv_id:
        return ""
    return f"https://arxiv.org/pdf/{arxiv_id}.pdf"
