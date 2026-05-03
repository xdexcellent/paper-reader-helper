from __future__ import annotations

import re
from collections.abc import Callable
from urllib.parse import quote, urlencode

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import SourceAdapter, SourceCandidate, clean_text, strip_html

GITHUB_TRENDING_BASE_URL = "https://github.com/trending"
_ARTICLE_RE = re.compile(
    r"<article\b[^>]*class=[\"'][^\"']*Box-row[^\"']*[\"'][^>]*>(?P<body>.*?)</article>",
    re.IGNORECASE | re.DOTALL,
)
_REPO_LINK_RE = re.compile(
    r"<a\b[^>]*href=[\"']/(?P<repo>[^\"'/]+/[^\"'/]+)[\"'][^>]*>(?P<label>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
_DESCRIPTION_RE = re.compile(r"<p\b[^>]*>(?P<value>.*?)</p>", re.IGNORECASE | re.DOTALL)
_LANGUAGE_RE = re.compile(
    r"<span\b[^>]*itemprop=[\"']programmingLanguage[\"'][^>]*>(?P<value>.*?)</span>",
    re.IGNORECASE | re.DOTALL,
)
_STAR_RE = re.compile(
    r"<a\b[^>]*href=[\"']/(?P<repo>[^\"']+)/stargazers[\"'][^>]*>(?P<value>.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)


class GitHubTrendingAdapter(SourceAdapter):
    source_kind = "github_trending"
    artifact_type = "project"

    def __init__(
        self,
        *,
        fetch_text: Callable[[str], str] | None = None,
    ) -> None:
        self._fetch_text = fetch_text or _default_fetch_text

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        page_url = _build_trending_url(subscription.config)
        html = self._fetch_text(page_url)

        candidates: list[SourceCandidate] = []
        for match in _ARTICLE_RE.finditer(html):
            block = match.group("body")
            repo_match = _REPO_LINK_RE.search(block)
            if repo_match is None:
                continue

            repo = clean_text(repo_match.group("repo"))
            language = _capture(_LANGUAGE_RE, block)
            stars_text = _capture(_STAR_RE, block)
            stars = _parse_stars(stars_text)
            candidates.append(
                SourceCandidate(
                    artifact_type=self.artifact_type,
                    source_kind=self.source_kind,
                    external_id=repo,
                    title=repo,
                    abstract_raw=_capture(_DESCRIPTION_RE, block),
                    canonical_url=f"https://github.com/{repo}",
                    metadata={
                        "language": language,
                        "stars": stars,
                        "since": str(subscription.config.get("since") or "daily"),
                    },
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


def _build_trending_url(config: dict) -> str:
    language = clean_text(str(config.get("language") or ""))
    since = clean_text(str(config.get("since") or "daily")) or "daily"
    base_url = GITHUB_TRENDING_BASE_URL
    if language:
        base_url = f"{base_url}/{quote(language, safe='')}"
    return f"{base_url}?{urlencode({'since': since})}"


def _capture(pattern: re.Pattern[str], block: str) -> str:
    match = pattern.search(block)
    if match is None:
        return ""
    return strip_html(match.group("value"))


def _parse_stars(value: str) -> int:
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else 0
