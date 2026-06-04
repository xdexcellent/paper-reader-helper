from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.base import SourceAdapter, SourceCandidate
from app.services.source_adapters.crossref_adapter import CrossRefAdapter
from app.services.source_adapters.dblp_adapter import DBLPAdapter
from app.services.source_adapters.github_trending_adapter import GitHubTrendingAdapter
from app.services.source_adapters.hf_papers_adapter import HFPapersAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.pwc_adapter import PapersWithCodeAdapter
from app.services.source_adapters.registry import get_adapter, list_adapters
from app.services.source_adapters.rss_adapter import RssAdapter
from app.services.source_adapters.semantic_scholar_adapter import SemanticScholarAdapter

__all__ = [
    "ArxivAdapter",
    "CrossRefAdapter",
    "DBLPAdapter",
    "GitHubTrendingAdapter",
    "HFPapersAdapter",
    "OpenReviewAdapter",
    "PapersWithCodeAdapter",
    "RssAdapter",
    "SemanticScholarAdapter",
    "SourceAdapter",
    "SourceCandidate",
    "get_adapter",
    "list_adapters",
]
