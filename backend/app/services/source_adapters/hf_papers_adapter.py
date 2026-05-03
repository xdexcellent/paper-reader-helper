from __future__ import annotations

import re
from collections.abc import Callable
from urllib.parse import urljoin

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, clean_text, strip_html

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
_ARXIV_ID_PATTERN = re.compile(r"^\d{4}\.\d{4,6}(v\d+)?$")


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
        html = self._fetch_text(page_url)

        candidates: list[SourceCandidate] = []
        for attrs, body in _ARTICLE_RE.findall(html):
            title_match = _TITLE_LINK_RE.search(body)
            if title_match is None:
                continue

            canonical_url = urljoin(HF_PAPERS_URL, title_match.group("href"))
            external_id = _data_id(attrs) or canonical_url.rstrip("/").rsplit("/", 1)[-1]
            pdf_url = _pdf_url_from_article(body, external_id)
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
    client = get_http_client(timeout=30, follow_redirects=True)
    try:
        response = client.get(url)
        response.raise_for_status()
        return response.text
    finally:
        client.close()


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


def _pdf_url_from_article(body: str, external_id: str = "") -> str:
    """Extract PDF URL from HF article body, falling back to external_id (arxiv id).

    HF Paper page IDs are arxiv IDs (e.g., '2510.12345'), so when the article body
    doesn't contain an explicit arxiv link, we can construct the PDF URL from the
    paper's external_id directly.
    """
    for href in _ANCHOR_RE.findall(body):
        match = _ARXIV_ID_RE.search(href)
        if match is None:
            continue
        arxiv_id = match.group("id").removesuffix(".pdf")
        return f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    # Fallback: HF paper IDs are arxiv IDs
    candidate_id = external_id.strip().removesuffix(".pdf")
    if candidate_id and _ARXIV_ID_PATTERN.match(candidate_id):
        return f"https://arxiv.org/pdf/{candidate_id}.pdf"
    return ""
