from __future__ import annotations

import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.models.paper import Paper
from app.services.arxiv_client import ArxivRateLimitError, fetch_arxiv_paper
from app.services.http_client_factory import fetch_with_retry
from app.services.venue_rank_service import apply_system_rank

logger = logging.getLogger(__name__)

SUPPORTED_SOURCES = {"arxiv", "hf_papers", "openalex", "semantic_scholar"}
OPENALEX_WORK_URL = "https://api.openalex.org/works"
S2_PAPER_URL = "https://api.semanticscholar.org/graph/v1/paper"
S2_DETAIL_FIELDS = "paperId,title,venue,journal,publicationVenue,externalIds"

_ARXIV_ID_RE = re.compile(
    r"(?P<id>(?:\d{4}\.\d{4,6}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?)",
    re.IGNORECASE,
)
_URL_LIKE_RE = re.compile(r"^(?:https?://|www\.)", re.IGNORECASE)
_LOW_CONFIDENCE_TOKENS = (
    "arxiv",
    "corr",
    "openreview",
    "preprint",
    "under review",
    "submitted",
    "manuscript",
    "hugging face",
    "huggingface",
    "papers with code",
    "project page",
    "project webpage",
)
_S2_LOCK = threading.Lock()
_S2_LAST_CALL = {"t": 0.0}
_S2_MIN_INTERVAL = 1.5
_OPENALEX_LOCK = threading.Lock()
_OPENALEX_LAST_CALL = {"t": 0.0}
_OPENALEX_MIN_INTERVAL = 1.0


@dataclass(frozen=True)
class VenueResolutionResult:
    status: str
    venue: str = ""
    note: str = ""
    source_used: str = ""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def _extract_arxiv_id(*values: str | None) -> str:
    for value in values:
        text = _clean_text(value)
        if not text:
            continue
        if "arxiv.org/" in text:
            match = re.search(r"arxiv\.org/(?:abs|pdf)/([^/?#]+)", text, re.IGNORECASE)
            if match:
                return match.group(1).removesuffix(".pdf")
        match = _ARXIV_ID_RE.search(text)
        if match:
            return match.group("id")
    return ""


def _extract_openalex_venue(work: dict[str, Any]) -> str:
    candidates = [
        work.get("primary_location", {}).get("source", {}).get("display_name"),
        work.get("host_venue", {}).get("display_name"),
        work.get("primary_location", {}).get("display_name"),
    ]
    for location in work.get("locations") or []:
        source = location.get("source") or {}
        candidates.append(source.get("display_name"))

    for candidate in candidates:
        text = _clean_text(candidate)
        if text:
            return text
    return ""


def _extract_semantic_scholar_venue(payload: dict[str, Any]) -> str:
    candidates = [
        payload.get("publicationVenue", {}).get("name"),
        payload.get("publicationVenue", {}).get("displayName"),
        payload.get("journal", {}).get("name"),
        payload.get("venue"),
    ]
    for candidate in candidates:
        text = _clean_text(candidate)
        if text:
            return text
    return ""


def _normalize_venue_candidate(venue: str, *, paper: Paper) -> str:
    text = _clean_text(venue).strip(" ,;:-")
    if not text:
        return ""
    if _URL_LIKE_RE.match(text):
        return ""
    if _normalize_token(text) == _normalize_token(paper.source or ""):
        return ""
    lowered = text.casefold()
    if lowered in {"n/a", "na", "none", "unknown", "unpublished"}:
        return ""
    if any(token in lowered for token in _LOW_CONFIDENCE_TOKENS):
        return ""
    return text


def _set_paper_resolution(paper: Paper, *, status: str, note: str, venue: str = "") -> None:
    if venue:
        paper.venue = venue
    paper.venue_resolution_status = status
    paper.venue_resolution_note = note
    paper.updated_at = _utcnow()


def _fetch_openalex_work(source_id: str) -> dict[str, Any]:
    work_id = _clean_text(source_id)
    if not work_id:
        return {}
    if not work_id.startswith("http"):
        work_id = f"{OPENALEX_WORK_URL}/{work_id}"

    params: dict[str, str] = {}
    email = os.environ.get("OPENALEX_EMAIL", "")
    if email:
        params["mailto"] = email

    with _OPENALEX_LOCK:
        now = time.time()
        elapsed = now - _OPENALEX_LAST_CALL["t"]
        if elapsed < _OPENALEX_MIN_INTERVAL:
            time.sleep(_OPENALEX_MIN_INTERVAL - elapsed)
        _OPENALEX_LAST_CALL["t"] = time.time()

    response = fetch_with_retry(
        work_id,
        params=params or None,
        timeout=30,
        max_retries=2,
        backoff_seconds=2.0,
    )
    return response.json()


def _search_openalex_work(*, title: str = "", arxiv_id: str = "") -> dict[str, Any]:
    params: dict[str, str | int] = {"per-page": 5}
    clean_title = _clean_text(title)
    clean_arxiv_id = _extract_arxiv_id(arxiv_id)
    if clean_arxiv_id:
        params["filter"] = f"locations.landing_page_url:https://arxiv.org/abs/{clean_arxiv_id}"
    elif clean_title:
        params["search"] = clean_title
    else:
        return {}

    email = os.environ.get("OPENALEX_EMAIL", "")
    if email:
        params["mailto"] = email

    with _OPENALEX_LOCK:
        now = time.time()
        elapsed = now - _OPENALEX_LAST_CALL["t"]
        if elapsed < _OPENALEX_MIN_INTERVAL:
            time.sleep(_OPENALEX_MIN_INTERVAL - elapsed)
        _OPENALEX_LAST_CALL["t"] = time.time()

    response = fetch_with_retry(
        OPENALEX_WORK_URL,
        params=params,
        timeout=30,
        max_retries=2,
        backoff_seconds=2.0,
    )
    payload = response.json()
    works = payload.get("results") or []
    if clean_arxiv_id:
        for work in works:
            for location in work.get("locations") or []:
                landing_page = _clean_text(location.get("landing_page_url"))
                pdf_url = _clean_text(location.get("pdf_url"))
                if landing_page.endswith(f"/abs/{clean_arxiv_id}") or pdf_url.endswith(f"{clean_arxiv_id}.pdf"):
                    return work
        return {}

    normalized_title = _normalize_token(clean_title)
    for work in works:
        display_name = _clean_text(work.get("display_name") or work.get("title"))
        if display_name and _normalize_token(display_name) == normalized_title:
            return work
    return {}


def _resolve_openalex_fallback_for_arxiv(paper: Paper) -> VenueResolutionResult:
    arxiv_id = _extract_arxiv_id(paper.source_id, paper.pdf_url, paper.url)
    payload = _search_openalex_work(title=paper.title, arxiv_id=arxiv_id)
    if not payload:
        return VenueResolutionResult(status="no_match", note="openalex_fallback_no_match", source_used="openalex")

    venue = _normalize_venue_candidate(_extract_openalex_venue(payload), paper=paper)
    if venue:
        return VenueResolutionResult(
            status="resolved",
            venue=venue,
            note="resolved_from_openalex_fallback",
            source_used="openalex",
        )
    return VenueResolutionResult(status="no_match", note="openalex_fallback_no_formal_venue", source_used="openalex")


def _fetch_semantic_scholar_paper(source_id: str) -> dict[str, Any]:
    paper_id = _clean_text(source_id)
    if not paper_id:
        return {}

    with _S2_LOCK:
        now = time.time()
        elapsed = now - _S2_LAST_CALL["t"]
        if elapsed < _S2_MIN_INTERVAL:
            time.sleep(_S2_MIN_INTERVAL - elapsed)
        _S2_LAST_CALL["t"] = time.time()

    headers: dict[str, str] = {}
    api_key = os.environ.get("S2_API_KEY") or os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key

    response = fetch_with_retry(
        f"{S2_PAPER_URL}/{paper_id}",
        params={"fields": S2_DETAIL_FIELDS},
        headers=headers,
        timeout=30,
        max_retries=2,
        backoff_seconds=5.0,
    )
    return response.json()


def _resolve_from_arxiv(paper: Paper) -> VenueResolutionResult:
    arxiv_id = _extract_arxiv_id(paper.source_id, paper.pdf_url, paper.url)
    if not arxiv_id:
        return VenueResolutionResult(status="no_source", note="missing_arxiv_id", source_used="arxiv")

    try:
        payload = fetch_arxiv_paper(arxiv_id, raise_on_error=True)
    except ArxivRateLimitError:
        return VenueResolutionResult(status="error", note="arxiv_rate_limited", source_used="arxiv")

    if not payload:
        return VenueResolutionResult(status="no_match", note="arxiv_lookup_empty", source_used="arxiv")

    venue = _normalize_venue_candidate(payload.get("journal_ref", ""), paper=paper)
    if venue:
        return VenueResolutionResult(
            status="resolved",
            venue=venue,
            note="resolved_from_arxiv_journal_ref",
            source_used="arxiv",
        )
    return _resolve_openalex_fallback_for_arxiv(paper)


def _resolve_from_openalex(paper: Paper) -> VenueResolutionResult:
    if not paper.source_id:
        return VenueResolutionResult(status="no_source", note="missing_openalex_id", source_used="openalex")

    payload = _fetch_openalex_work(paper.source_id)
    venue = _normalize_venue_candidate(_extract_openalex_venue(payload), paper=paper)
    if venue:
        return VenueResolutionResult(
            status="resolved",
            venue=venue,
            note="resolved_from_openalex",
            source_used="openalex",
        )
    return VenueResolutionResult(status="no_match", note="openalex_no_formal_venue", source_used="openalex")


def _resolve_from_semantic_scholar(paper: Paper) -> VenueResolutionResult:
    if not paper.source_id:
        return VenueResolutionResult(
            status="no_source",
            note="missing_semantic_scholar_id",
            source_used="semantic_scholar",
        )

    payload = _fetch_semantic_scholar_paper(paper.source_id)
    venue = _normalize_venue_candidate(_extract_semantic_scholar_venue(payload), paper=paper)
    if venue:
        return VenueResolutionResult(
            status="resolved",
            venue=venue,
            note="resolved_from_semantic_scholar",
            source_used="semantic_scholar",
        )

    external_ids = payload.get("externalIds") or {}
    arxiv_id = _extract_arxiv_id(external_ids.get("ArXiv"))
    if arxiv_id:
        arxiv_result = _resolve_from_arxiv(
            Paper(
                source=paper.source,
                source_id=arxiv_id,
                title=paper.title,
                local_pdf_path=paper.local_pdf_path,
            )
        )
        if arxiv_result.status == "resolved":
            return VenueResolutionResult(
                status="resolved",
                venue=arxiv_result.venue,
                note="resolved_from_semantic_scholar_arxiv_fallback",
                source_used="semantic_scholar",
            )

    return VenueResolutionResult(
        status="no_match",
        note="semantic_scholar_no_formal_venue",
        source_used="semantic_scholar",
    )


def resolve_paper_venue(session: Session, paper: Paper, *, force: bool = False) -> VenueResolutionResult:
    if paper.venue and not force:
        result = VenueResolutionResult(status="resolved", venue=paper.venue, note="existing_venue", source_used="paper")
        _set_paper_resolution(paper, status=result.status, note=result.note, venue=paper.venue)
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return result

    resolver_map = {
        "arxiv": _resolve_from_arxiv,
        "hf_papers": _resolve_from_arxiv,
        "openalex": _resolve_from_openalex,
        "semantic_scholar": _resolve_from_semantic_scholar,
    }
    resolver = resolver_map.get(paper.source)
    if resolver is None:
        result = VenueResolutionResult(status="no_source", note="source_not_supported", source_used=paper.source or "")
        _set_paper_resolution(paper, status=result.status, note=result.note)
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return result

    try:
        result = resolver(paper)
    except Exception as exc:
        logger.exception("Venue resolution failed for paper %s", paper.id)
        result = VenueResolutionResult(
            status="error",
            note=f"{paper.source}_lookup_error:{str(exc)[:120]}",
            source_used=paper.source or "",
        )

    _set_paper_resolution(paper, status=result.status, note=result.note, venue=result.venue)
    if result.status == "resolved":
        apply_system_rank(paper, session)
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return result


def _should_attempt_resolution(paper: Paper, *, force: bool) -> bool:
    if paper.venue:
        return force
    if force:
        return True
    return paper.venue_resolution_status not in {"resolved", "no_source", "no_match"}


def batch_backfill_missing_venues(
    session: Session,
    *,
    paper_ids: list[int] | None = None,
    force: bool = False,
    limit: int | None = None,
) -> dict[str, int]:
    id_filter = set(paper_ids or [])
    papers = list(session.exec(select(Paper).order_by(Paper.id.asc())).all())
    candidates: list[Paper] = []
    for paper in papers:
        if id_filter and paper.id not in id_filter:
            continue
        if not _should_attempt_resolution(paper, force=force):
            continue
        candidates.append(paper)
        if limit is not None and len(candidates) >= limit:
            break

    summary = {
        "total": len(candidates),
        "resolved": 0,
        "no_source": 0,
        "no_match": 0,
        "error": 0,
    }
    for paper in candidates:
        result = resolve_paper_venue(session, paper, force=force)
        if result.status in summary:
            summary[result.status] += 1
        else:
            summary["error"] += 1
    return summary


def get_venue_backfill_status(session: Session) -> dict[str, int]:
    papers = list(session.exec(select(Paper)).all())
    stats = {
        "missing_total": 0,
        "supported_missing": 0,
        "resolved": 0,
        "pending": 0,
        "no_source": 0,
        "no_match": 0,
        "error": 0,
    }
    for paper in papers:
        status = (paper.venue_resolution_status or "pending").strip() or "pending"
        if paper.venue:
            stats["resolved"] += 1
            continue
        stats["missing_total"] += 1
        if paper.source in SUPPORTED_SOURCES:
            stats["supported_missing"] += 1
        if status not in stats:
            status = "pending"
        stats[status] += 1
    return stats


