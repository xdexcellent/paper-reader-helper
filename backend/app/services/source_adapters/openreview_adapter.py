from __future__ import annotations

import logging
from collections.abc import Callable
from urllib.parse import urljoin

import httpx

from app.models.subscription import Subscription
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, clean_text, parse_datetime

logger = logging.getLogger(__name__)

OPENREVIEW_BASE_URL = "https://openreview.net"
OPENREVIEW_NOTES_API = "https://api2.openreview.net/notes"


class OpenReviewAdapter(SourceAdapter):
    source_kind = "openreview"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_json: Callable[[str, dict], dict] | None = None,
    ) -> None:
        self._fetch_json = fetch_json or _default_fetch_json

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        config = subscription.config
        api_url = str(config.get("api_url") or OPENREVIEW_NOTES_API)
        params = _build_params(config)
        params.setdefault("limit", subscription.fetch_limit)

        try:
            payload = self._fetch_json(api_url, params)
        except Exception:
            logger.exception("OpenReview adapter fetch failed for %s", api_url)
            return []

        notes = payload.get("notes") or payload.get("results") or []
        candidates: list[SourceCandidate] = []
        for note in notes[: subscription.fetch_limit]:
            content = note.get("content") or {}
            external_id = clean_text(str(note.get("id") or note.get("forum") or ""))
            pdf_path = _content_value(content.get("pdf"))
            venue = (
                _content_value(content.get("venue"))
                or _content_value(content.get("venueid"))
                or clean_text(str(config.get("venue") or config.get("venueid") or ""))
            )
            pdf_url = urljoin(OPENREVIEW_BASE_URL, _string_value(pdf_path)) if pdf_path else ""
            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=external_id,
                    title=_string_value(_content_value(content.get("title"))),
                    authors=", ".join(_list_value(_content_value(content.get("authors")))),
                    abstract_raw=_string_value(_content_value(content.get("abstract"))),
                    canonical_url=f"{OPENREVIEW_BASE_URL}/forum?id={external_id}" if external_id else "",
                    pdf_url=pdf_url,
                    published_at=parse_datetime(
                        note.get("pdate") or note.get("cdate") or note.get("tcdate")
                    ),
                    metadata={"venue": venue, "invitation": note.get("invitation", "")},
                )
            )
        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    response = httpx.get(url, params=params, timeout=30, follow_redirects=True)
    response.raise_for_status()
    return response.json()


def _build_params(config: dict) -> dict:
    raw_params = config.get("params")
    if isinstance(raw_params, dict) and raw_params:
        return dict(raw_params)

    invitation = clean_text(str(config.get("invitation") or ""))
    if invitation:
        return {"invitation": invitation}

    venue_id = clean_text(str(config.get("venueid") or config.get("venue") or ""))
    if venue_id:
        return {"content.venueid": venue_id}

    return {}


def _content_value(value):
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value


def _list_value(value) -> list[str]:
    if isinstance(value, list):
        return [clean_text(str(item)) for item in value if clean_text(str(item))]
    if value is None:
        return []
    text = clean_text(str(value))
    return [text] if text else []


def _string_value(value) -> str:
    if value is None:
        return ""
    return clean_text(str(value))
