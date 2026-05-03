import json
from datetime import datetime, timezone
from pathlib import Path

from app.services.arxiv_client import _build_search_query
from app.models.subscription import Subscription
from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.base import SourceCandidate
from app.services.source_adapters.github_trending_adapter import (
    GitHubTrendingAdapter,
    _build_trending_url,
)
from app.services.source_adapters.hf_papers_adapter import HFPapersAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.registry import get_adapter
from app.services.source_adapters.rss_adapter import RssAdapter

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _subscription(
    source_kind: str,
    *,
    query: str = "",
    fetch_limit: int = 10,
    config: dict | None = None,
) -> Subscription:
    sub = Subscription(
        name=f"{source_kind}-sub",
        type=source_kind,
        source_kind=source_kind,
        query=query,
        fetch_limit=fetch_limit,
    )
    sub.config = config or {}
    return sub


def _read_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def _read_json_fixture(name: str) -> dict:
    return json.loads(_read_fixture(name))


def test_source_candidate_fingerprint_prefers_external_id() -> None:
    base = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.00001v1",
        title="Paper A",
        canonical_url="https://example.com/a",
        pdf_url="https://example.com/a.pdf",
        published_at=datetime(2026, 4, 19, tzinfo=timezone.utc),
    )
    variant = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.00001v1",
        title="Paper B",
        canonical_url="https://example.com/b",
        pdf_url="https://example.com/b.pdf",
        published_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )

    assert base.fingerprint() == variant.fingerprint()


def test_source_candidate_fingerprint_falls_back_to_pdf_url() -> None:
    first = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="Paper A",
        pdf_url="https://example.com/paper.pdf",
    )
    second = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="Paper B",
        pdf_url="https://example.com/paper.pdf",
    )

    assert first.fingerprint() == second.fingerprint()


def test_source_candidate_fingerprint_falls_back_to_canonical_url() -> None:
    first = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="Paper A",
        canonical_url="https://example.com/paper",
    )
    second = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="Paper B",
        canonical_url="https://example.com/paper",
    )

    assert first.fingerprint() == second.fingerprint()


def test_source_candidate_fingerprint_falls_back_to_normalized_title_and_date() -> None:
    first = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="  RSS   Paper  ",
        published_at=datetime(2026, 4, 19, 8, 0, tzinfo=timezone.utc),
    )
    second = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        title="rss paper",
        published_at=datetime(2026, 4, 19, 23, 30, tzinfo=timezone.utc),
    )

    assert first.fingerprint() == second.fingerprint()


def test_build_search_query_preserves_advanced_arxiv_query() -> None:
    assert _build_search_query("cat:cs.LG AND all:diffusion") == "cat:cs.LG AND all:diffusion"


def test_build_search_query_wraps_plain_text_for_simple_search() -> None:
    assert _build_search_query("diffusion transformer") == "all:diffusion transformer"


def test_get_adapter_returns_registered_adapters() -> None:
    assert isinstance(get_adapter("arxiv"), ArxivAdapter)
    assert isinstance(get_adapter("rss"), RssAdapter)
    assert isinstance(get_adapter("openreview"), OpenReviewAdapter)
    assert isinstance(get_adapter("hf_papers"), HFPapersAdapter)
    assert isinstance(get_adapter("github_trending"), GitHubTrendingAdapter)


def test_arxiv_adapter_maps_search_results() -> None:
    adapter = ArxivAdapter(
        search_fn=lambda query, max_results: [
            {
                "title": "Structured Diffusion",
                "authors": "Alice, Bob",
                "abstract": "A paper abstract",
                "pdf_url": "https://arxiv.org/pdf/2404.00001v1.pdf",
                "arxiv_id": "2404.00001v1",
                "published": "2026-04-19T09:00:00Z",
            }
        ]
    )

    candidates = adapter.fetch_candidates(
        _subscription("arxiv", query="cat:cs.LG", fetch_limit=3)
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.artifact_type == "paper"
    assert candidate.source_kind == "arxiv"
    assert candidate.external_id == "2404.00001v1"
    assert candidate.title == "Structured Diffusion"
    assert candidate.authors == "Alice, Bob"
    assert candidate.abstract_raw == "A paper abstract"
    assert candidate.canonical_url == "https://arxiv.org/abs/2404.00001v1"
    assert candidate.pdf_url == "https://arxiv.org/pdf/2404.00001v1.pdf"
    assert candidate.published_at == datetime(2026, 4, 19, 9, 0, tzinfo=timezone.utc)


def test_rss_adapter_maps_feed_items() -> None:
    feed_text = """\
<rss version="2.0">
  <channel>
    <item>
      <title>RSS Paper</title>
      <link>https://example.com/papers/rss-paper</link>
      <description>RSS abstract</description>
      <author>Alice, Bob</author>
      <guid>rss-paper-1</guid>
      <pubDate>Sun, 14 Apr 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/papers/rss-paper.pdf" type="application/pdf" />
    </item>
  </channel>
</rss>
"""
    adapter = RssAdapter(fetch_text=lambda url: feed_text)

    candidates = adapter.fetch_candidates(
        _subscription("rss", query="https://example.com/feed.xml", fetch_limit=5)
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.artifact_type == "paper"
    assert candidate.source_kind == "rss"
    assert candidate.external_id == "rss-paper-1"
    assert candidate.title == "RSS Paper"
    assert candidate.authors == "Alice, Bob"
    assert candidate.abstract_raw == "RSS abstract"
    assert candidate.canonical_url == "https://example.com/papers/rss-paper"
    assert candidate.pdf_url == "https://example.com/papers/rss-paper.pdf"
    assert candidate.published_at == datetime(2024, 4, 14, 10, 0, tzinfo=timezone.utc)


def test_openreview_adapter_maps_notes_json() -> None:
    payload = _read_json_fixture("openreview_notes_search.json")
    captured: dict[str, object] = {}

    def fetch_json(url: str, params: dict) -> dict:
        captured["url"] = url
        captured["params"] = dict(params)
        return payload

    adapter = OpenReviewAdapter(fetch_json=fetch_json)

    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            config={
                "params": {"invitation": "ICLR.cc/2026/Conference/-/Blind_Submission"},
            },
            fetch_limit=3,
        )
    )

    assert captured["url"] == "https://api2.openreview.net/notes"
    assert captured["params"] == {
        "invitation": "ICLR.cc/2026/Conference/-/Blind_Submission",
        "limit": 3,
    }
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.artifact_type == "paper"
    assert candidate.source_kind == "openreview"
    assert candidate.external_id == "or-note-1"
    assert candidate.title == "OpenReview Paper"
    assert candidate.authors == "Alice, Bob"
    assert candidate.abstract_raw == "OpenReview abstract"
    assert candidate.canonical_url == "https://openreview.net/forum?id=or-note-1"
    assert candidate.pdf_url == "https://openreview.net/pdf?id=or-note-1"
    assert candidate.published_at == datetime(2024, 4, 14, 11, 0, tzinfo=timezone.utc)


def test_openreview_adapter_builds_venue_filter_from_config() -> None:
    payload = _read_json_fixture("openreview_notes_search.json")
    captured: dict[str, object] = {}

    def fetch_json(url: str, params: dict) -> dict:
        captured["url"] = url
        captured["params"] = dict(params)
        return payload

    adapter = OpenReviewAdapter(fetch_json=fetch_json)

    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            config={"venue": "ICLR.cc/2026/Conference"},
            fetch_limit=2,
        )
    )

    assert captured["url"] == "https://api2.openreview.net/notes"
    assert captured["params"] == {
        "content.venueid": "ICLR.cc/2026/Conference",
        "limit": 2,
    }
    assert len(candidates) == 1
    assert candidates[0].metadata["venue"] == "ICLR.cc/2026/Conference"


def test_openreview_adapter_filters_candidates_by_query_keyword() -> None:
    payload = _read_json_fixture("openreview_notes_mixed.json")
    captured: dict[str, object] = {}

    def fetch_json(url: str, params: dict) -> dict:
        captured["params"] = dict(params)
        return payload

    adapter = OpenReviewAdapter(fetch_json=fetch_json)

    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            query="diffusion",
            config={"venue": "ICLR.cc/2026/Conference"},
            fetch_limit=5,
        )
    )

    # 过滤模式下 limit 会被放大以抓更大的池子
    assert captured["params"]["limit"] >= 5 * 5
    titles = [c.title for c in candidates]
    assert "Diffusion Transformers for Image Generation" in titles
    assert "Consistency Models Revisited" in titles
    assert "Offline Reinforcement Learning with Actor Critic" not in titles
    assert "Vision Language Pretraining" not in titles


def test_openreview_adapter_filter_supports_multi_token_and_match() -> None:
    payload = _read_json_fixture("openreview_notes_mixed.json")

    adapter = OpenReviewAdapter(fetch_json=lambda url, params: payload)
    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            query="diffusion transformer",
            config={"venue": "ICLR.cc/2026/Conference"},
            fetch_limit=5,
        )
    )

    # 两个 token 都要命中
    titles = [c.title for c in candidates]
    assert titles == ["Diffusion Transformers for Image Generation"]


def test_openreview_adapter_filter_respects_custom_search_pool_size() -> None:
    payload = _read_json_fixture("openreview_notes_mixed.json")
    captured: dict[str, object] = {}

    def fetch_json(url: str, params: dict) -> dict:
        captured["params"] = dict(params)
        return payload

    adapter = OpenReviewAdapter(fetch_json=fetch_json)
    adapter.fetch_candidates(
        _subscription(
            "openreview",
            query="diffusion",
            config={"venue": "ICLR.cc/2026/Conference", "search_pool_size": 42},
            fetch_limit=3,
        )
    )

    assert captured["params"]["limit"] == 42


def test_openreview_adapter_stops_at_fetch_limit_after_filter() -> None:
    payload = _read_json_fixture("openreview_notes_mixed.json")

    adapter = OpenReviewAdapter(fetch_json=lambda url, params: payload)
    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            query="diffusion",
            config={"venue": "ICLR.cc/2026/Conference"},
            fetch_limit=1,
        )
    )

    assert len(candidates) == 1


def test_openreview_adapter_builds_invitation_filter_from_config() -> None:
    payload = _read_json_fixture("openreview_notes_search.json")
    captured: dict[str, object] = {}

    def fetch_json(url: str, params: dict) -> dict:
        captured["url"] = url
        captured["params"] = dict(params)
        return payload

    adapter = OpenReviewAdapter(fetch_json=fetch_json)

    candidates = adapter.fetch_candidates(
        _subscription(
            "openreview",
            config={"invitation": "ICLR.cc/2026/Conference/-/Submission"},
            fetch_limit=4,
        )
    )

    assert captured["url"] == "https://api2.openreview.net/notes"
    assert captured["params"] == {
        "invitation": "ICLR.cc/2026/Conference/-/Submission",
        "limit": 4,
    }
    assert len(candidates) == 1


def test_hf_papers_adapter_maps_html_cards() -> None:
    html = _read_fixture("hf_papers_page.html")
    adapter = HFPapersAdapter(fetch_text=lambda url: html)

    candidates = adapter.fetch_candidates(
        _subscription("hf_papers", config={"url": "https://huggingface.co/papers"})
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.artifact_type == "paper"
    assert candidate.source_kind == "hf_papers"
    assert candidate.external_id == "2404.00001"
    assert candidate.title == "HF Daily Paper"
    assert candidate.authors == "Alice, Bob"
    assert candidate.abstract_raw == "HF abstract"
    assert candidate.canonical_url == "https://huggingface.co/papers/2404.00001"
    assert candidate.pdf_url == "https://arxiv.org/pdf/2404.00001.pdf"


def test_github_trending_adapter_maps_projects() -> None:
    html = _read_fixture("github_trending_page.html")
    adapter = GitHubTrendingAdapter(fetch_text=lambda url: html)

    candidates = adapter.fetch_candidates(
        _subscription(
            "github_trending",
            config={"language": "python", "since": "daily"},
            fetch_limit=5,
        )
    )

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.artifact_type == "project"
    assert candidate.source_kind == "github_trending"
    assert candidate.external_id == "openai/paper-reader-helper"
    assert candidate.title == "openai/paper-reader-helper"
    assert candidate.abstract_raw == "Daily paper tracking for teams."
    assert candidate.canonical_url == "https://github.com/openai/paper-reader-helper"
    assert candidate.pdf_url == ""
    assert candidate.metadata["language"] == "Python"
    assert candidate.metadata["stars"] == 1234


def test_build_trending_url_encodes_language_path() -> None:
    assert _build_trending_url({"language": "c#", "since": "weekly"}) == (
        "https://github.com/trending/c%23?since=weekly"
    )
