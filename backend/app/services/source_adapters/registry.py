from __future__ import annotations

from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.base import SourceAdapter
from app.services.source_adapters.github_trending_adapter import GitHubTrendingAdapter
from app.services.source_adapters.hf_papers_adapter import HFPapersAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.rss_adapter import RssAdapter

_ADAPTERS: dict[str, SourceAdapter] = {
    "arxiv": ArxivAdapter(),
    "rss": RssAdapter(),
    "openreview": OpenReviewAdapter(),
    "hf_papers": HFPapersAdapter(),
    "github_trending": GitHubTrendingAdapter(),
}


def get_adapter(source_kind: str) -> SourceAdapter:
    try:
        return _ADAPTERS[source_kind]
    except KeyError as exc:
        raise KeyError(f"Unsupported source adapter: {source_kind}") from exc


def list_adapters() -> dict[str, SourceAdapter]:
    return dict(_ADAPTERS)
