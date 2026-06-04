from __future__ import annotations

from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.base import SourceAdapter
from app.services.source_adapters.crossref_adapter import CrossRefAdapter
from app.services.source_adapters.dblp_adapter import DBLPAdapter
from app.services.source_adapters.github_trending_adapter import GitHubTrendingAdapter
from app.services.source_adapters.hf_papers_adapter import HFPapersAdapter
from app.services.source_adapters.openalex_adapter import OpenAlexAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.pwc_adapter import PapersWithCodeAdapter
from app.services.source_adapters.rss_adapter import RssAdapter
from app.services.source_adapters.semantic_scholar_adapter import SemanticScholarAdapter
from app.services.source_adapters.unpaywall_adapter import UnpaywallAdapter

_ADAPTERS: dict[str, SourceAdapter] = {
    "arxiv": ArxivAdapter(),
    "rss": RssAdapter(),
    "openreview": OpenReviewAdapter(),
    "hf_papers": HFPapersAdapter(),
    "github_trending": GitHubTrendingAdapter(),
    "semantic_scholar": SemanticScholarAdapter(),
    "pwc": PapersWithCodeAdapter(),
    "dblp": DBLPAdapter(),
    "crossref": CrossRefAdapter(),
    "openalex": OpenAlexAdapter(),
    "unpaywall": UnpaywallAdapter(),
}


def get_adapter(source_kind: str) -> SourceAdapter:
    try:
        return _ADAPTERS[source_kind]
    except KeyError as exc:
        raise KeyError(f"Unsupported source adapter: {source_kind}") from exc


def list_adapters() -> dict[str, SourceAdapter]:
    return dict(_ADAPTERS)
