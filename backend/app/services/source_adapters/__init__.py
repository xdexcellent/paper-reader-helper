from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.base import SourceAdapter, SourceCandidate
from app.services.source_adapters.github_trending_adapter import GitHubTrendingAdapter
from app.services.source_adapters.hf_papers_adapter import HFPapersAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.registry import get_adapter, list_adapters
from app.services.source_adapters.rss_adapter import RssAdapter

__all__ = [
    "ArxivAdapter",
    "GitHubTrendingAdapter",
    "HFPapersAdapter",
    "OpenReviewAdapter",
    "RssAdapter",
    "SourceAdapter",
    "SourceCandidate",
    "get_adapter",
    "list_adapters",
]
