from __future__ import annotations

from collections.abc import Callable
from urllib.parse import urljoin

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, clean_text, parse_datetime

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

        keyword_tokens = _tokenize_query(subscription.query or "")
        if keyword_tokens:
            # 过滤模式：抓取更大的池子，给关键词过滤留余地
            pool_size = int(config.get("search_pool_size") or subscription.fetch_limit * 5)
            params.setdefault("limit", max(pool_size, subscription.fetch_limit))
        else:
            params.setdefault("limit", subscription.fetch_limit)

        payload = self._fetch_json(api_url, params)

        notes = payload.get("notes") or payload.get("results") or []
        candidates: list[SourceCandidate] = []
        for note in notes:
            content = note.get("content") or {}
            external_id = clean_text(str(note.get("id") or note.get("forum") or ""))
            pdf_path = _content_value(content.get("pdf"))
            venue = (
                _content_value(content.get("venue"))
                or _content_value(content.get("venueid"))
                or clean_text(str(config.get("venue") or config.get("venueid") or ""))
            )
            title = _string_value(_content_value(content.get("title")))
            abstract_raw = _string_value(_content_value(content.get("abstract")))
            paper_keywords = _list_value(_content_value(content.get("keywords")))

            if keyword_tokens and not _matches_all_tokens(
                keyword_tokens, title, abstract_raw, paper_keywords
            ):
                continue

            pdf_url = urljoin(OPENREVIEW_BASE_URL, _string_value(pdf_path)) if pdf_path else ""
            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=external_id,
                    title=title,
                    authors=", ".join(_list_value(_content_value(content.get("authors")))),
                    abstract_raw=abstract_raw,
                    canonical_url=f"{OPENREVIEW_BASE_URL}/forum?id={external_id}" if external_id else "",
                    pdf_url=pdf_url,
                    published_at=parse_datetime(
                        note.get("pdate") or note.get("cdate") or note.get("tcdate")
                    ),
                    metadata={
                        "venue": venue,
                        "invitation": note.get("invitation", ""),
                        "keywords": paper_keywords,
                    },
                )
            )
            if len(candidates) >= subscription.fetch_limit:
                break
        return candidates


def _default_fetch_json(url: str, params: dict) -> dict:
    client = get_http_client(timeout=30, follow_redirects=True)
    try:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    finally:
        client.close()


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


def _tokenize_query(query: str) -> list[str]:
    """将用户的关键词查询拆分为小写 token 列表。空格分隔、去重。"""
    tokens: list[str] = []
    seen: set[str] = set()
    for raw in query.lower().split():
        token = raw.strip()
        if not token or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


def _matches_all_tokens(
    tokens: list[str], title: str, abstract: str, keywords: list[str]
) -> bool:
    """所有 token 需在 title / abstract / keywords 中至少命中一处（AND 语义）。"""
    haystack_parts = [title or "", abstract or ""]
    haystack_parts.extend(keywords or [])
    haystack = " ".join(haystack_parts).lower()
    return all(token in haystack for token in tokens)
