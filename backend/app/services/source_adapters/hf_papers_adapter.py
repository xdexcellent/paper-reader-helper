from __future__ import annotations

import logging
import re
from collections.abc import Callable
from urllib.parse import urljoin

import httpx

from app.models.subscription import Subscription
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, clean_text, strip_html

logger = logging.getLogger(__name__)

HF_PAPERS_URL = "https://huggingface.co/papers"
_ARTICLE_RE = re.compile(r"<article\b(?P<attrs>[^>]*)>(?P<body>.*?)</article>", re.IGNORECASE | re.DOTALL)
_DATA_ID_RE = re.compile(r'data-paper-id=["\'](?P<value>[^"\']+)["\']', re.IGNORECASE)
_TITLE_LINK_RE = re.compile(
    r"<h[1-6][^>]*>\s*<a[^>]*href=[\"'](?P<href>[^\"']+)[\"'][^>]*>(?P<title>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
_PARAGRAPH_RE = re.compile(r"<p\b[^>]*>(?P<value>.*?)</p>", re.IGNORECASE | re.DOTALL)
_AUTHOR_RE = re.compile(
    r"<span\b[^>]*class=[\"'][^\"']*author[^\"']*[\"'][^>]*>(?P<value>.*?)</span>",
    re.IGNORECASE | re.DOTALL,
)
_ANCHOR_RE = re.compile(r"<a\b[^>]*href=[\"'](?P<href>[^\"']+)[\"'][^>]*>", re.IGNORECASE)
_ARXIV_ID_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(?P<id>[^/?#]+)")


class HFPapersAdapter(SourceAdapter):
    source_kind = "hf_papers"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_text: Callable[[str], str] | None = None,
    ) -> None:
        self._fetch_text = fetch_text or _default_fetch_text

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        page_url = str(subscription.config.get("url") or HF_PAPERS_URL)
        try:
            html = self._fetch_text(page_url)
        except Exception:
            logger.exception("HF papers adapter fetch failed for %s", page_url)
            return []

        candidates: list[SourceCandidate] = []
        for attrs, body in _ARTICLE_RE.findall(html):
            title_match = _TITLE_LINK_RE.search(body)
            if title_match is None:
                continue

            canonical_url = urljoin(HF_PAPERS_URL, title_match.group("href"))
            external_id = _data_id(attrs) or canonical_url.rstrip("/").rsplit("/", 1)[-1]
            pdf_url = _pdf_url_from_article(body)
            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=external_id,
                    title=strip_html(title_match.group("title")),
                    authors=", ".join(strip_html(value) for value in _AUTHOR_RE.findall(body)),
                    abstract_raw=_paragraph_text(body),
                    canonical_url=canonical_url,
                    pdf_url=pdf_url,
                    metadata={"page_url": page_url},
                )
            )
            if len(candidates) >= subscription.fetch_limit:
                break
        return candidates


def _default_fetch_text(url: str) -> str:
    response = httpx.get(url, timeout=30, follow_redirects=True)
    response.raise_for_status()
    return response.text


def _data_id(attrs: str) -> str:
    match = _DATA_ID_RE.search(attrs)
    if match is None:
        return ""
    return clean_text(match.group("value"))


def _paragraph_text(body: str) -> str:
    match = _PARAGRAPH_RE.search(body)
    if match is None:
        return ""
    return strip_html(match.group("value"))


def _pdf_url_from_article(body: str) -> str:
    for href in _ANCHOR_RE.findall(body):
        match = _ARXIV_ID_RE.search(href)
        if match is None:
            continue
        arxiv_id = match.group("id").removesuffix(".pdf")
        return f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    return ""
