import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest
from sqlmodel import SQLModel, Session, create_engine, select

import app.api.routes.automation as automation_routes
import app.services.daily_ingestion as daily_ingestion_module
from app.models.daily_briefing import DailyBriefing, DailyBriefingPaperItem, DailyBriefingProjectItem
from app.models.daily_run import DailyRun
from app.models.easyscholar_settings import EasyScholarSettings
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.subscription import Subscription
from app.services.automation_settings_service import AutomationSettingsService
from app.services.category_service import ensure_default_categories
from app.services.daily_briefing_service import DailyBriefingService
from app.services.daily_ingestion import DailyIngestionService
from app.services.source_adapters.base import SourceCandidate
from app.services.storage import StorageService


class _FakeAdapter:
    def __init__(self, candidates: list[SourceCandidate]) -> None:
        self._candidates = candidates

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        return list(self._candidates)


class _FailingAdapter:
    def __init__(self, error: Exception) -> None:
        self._error = error

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        raise self._error


class _FakePipelineService:
    def __init__(self) -> None:
        self.parse_calls: list[int] = []
        self.summarize_calls: list[tuple[int, str]] = []

    def parse_paper(self, session: Session, paper: Paper) -> Paper:
        self.parse_calls.append(paper.id)
        paper.status = "parsed"
        paper.parse_status = "completed"
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper

    def summarize_paper(self, session: Session, paper: Paper, model: str = "gpt-5.4-mini") -> Paper:
        self.summarize_calls.append((paper.id, model))
        paper.status = "ready"
        paper.summary_status = "completed"
        paper.ready_at = datetime.now(timezone.utc)
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        ensure_default_categories(session)
    yield engine


def _configure_settings(
    session: Session,
    *,
    schedule_time: str = "08:30",
    timezone_name: str = "Asia/Shanghai",
) -> None:
    settings = AutomationSettingsService.get_settings(session)
    settings.schedule_time = schedule_time
    settings.timezone = timezone_name
    session.add(settings)
    session.commit()


def _make_subscription(
    session: Session,
    source_kind: str,
    *,
    query: str = "",
    config: dict | None = None,
    is_active: bool = True,
) -> Subscription:
    subscription = Subscription(
        name=f"{source_kind}-sub",
        type=source_kind,
        source_kind=source_kind,
        display_name=f"{source_kind}-display",
        query=query,
        fetch_limit=10,
        is_active=is_active,
    )
    subscription.config = config or {}
    session.add(subscription)
    session.commit()
    session.refresh(subscription)
    return subscription


def _make_service(
    session: Session,
    tmp_path: Path,
    adapters: dict[str, _FakeAdapter],
    *,
    pipeline_service: _FakePipelineService | None = None,
    pdf_downloader=None,
) -> DailyIngestionService:
    return DailyIngestionService(
        session,
        pipeline_service=pipeline_service or _FakePipelineService(),
        storage_service=StorageService(root=str(tmp_path / "storage")),
        adapter_resolver=lambda kind: adapters[kind],
        pdf_downloader=pdf_downloader or (lambda url: b"%PDF-1.4\n%%EOF\n"),
    )


def test_run_for_date_handles_mixed_paper_and_project_candidates(session_factory, tmp_path: Path) -> None:
    paper_candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.00001v1",
        title="Daily Paper",
        authors="Alice, Bob",
        abstract_raw="Paper abstract",
        canonical_url="https://arxiv.org/abs/2404.00001v1",
        pdf_url="https://arxiv.org/pdf/2404.00001v1.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
        metadata={"topic": "llm"},
    )
    project_candidate = SourceCandidate(
        artifact_type="project",
        source_kind="github_trending",
        external_id="openai/paper-reader-helper",
        title="openai/paper-reader-helper",
        abstract_raw="Trending project",
        canonical_url="https://github.com/openai/paper-reader-helper",
        metadata={"stars": 1234},
    )

    with Session(session_factory) as session:
        _configure_settings(session, schedule_time="08:30", timezone_name="Asia/Shanghai")
        arxiv_sub = _make_subscription(session, "arxiv", query="cat:cs.LG")
        github_sub = _make_subscription(
            session,
            "github_trending",
            config={"language": "python", "since": "daily"},
        )
        inactive_sub = _make_subscription(session, "rss", query="https://example.com/feed.xml", is_active=False)
        pipeline = _FakePipelineService()
        service = _make_service(
            session,
            tmp_path,
            {
                "arxiv": _FakeAdapter([paper_candidate]),
                "github_trending": _FakeAdapter([project_candidate]),
                "rss": _FakeAdapter(
                    [
                        SourceCandidate(
                            artifact_type="paper",
                            source_kind="rss",
                            title="Should Not Run",
                            pdf_url="https://example.com/unused.pdf",
                        )
                    ]
                ),
            },
            pipeline_service=pipeline,
        )

        run = service.run_for_date(date(2026, 4, 18))
        papers = session.exec(select(Paper)).all()
        items = session.exec(select(IngestionItem).order_by(IngestionItem.id)).all()
        arxiv_sub = session.get(Subscription, arxiv_sub.id)
        github_sub = session.get(Subscription, github_sub.id)
        inactive_sub = session.get(Subscription, inactive_sub.id)

    assert run.status == "completed"
    assert run.trigger_type == "scheduled"
    assert run.completed_at is not None
    assert run.error_message is None
    assert run.scheduled_for.replace(tzinfo=timezone.utc) == datetime(2026, 4, 18, 0, 30, tzinfo=timezone.utc)
    assert len(pipeline.parse_calls) == 1
    assert len(pipeline.summarize_calls) == 1

    assert len(papers) == 1
    assert papers[0].source == "arxiv"
    assert papers[0].source_id == "2404.00001v1"
    assert papers[0].status == "ready"
    assert Path(papers[0].local_pdf_path).exists()

    assert len(items) == 2
    assert items[0].artifact_type == "paper"
    assert items[0].status == "processed"
    assert items[0].paper_id == papers[0].id
    assert items[1].artifact_type == "project"
    assert items[1].status == "processed"
    assert items[1].paper_id is None

    assert arxiv_sub is not None
    assert arxiv_sub.last_checked_at is not None
    assert arxiv_sub.last_success_at is not None
    assert arxiv_sub.last_error is None
    assert github_sub is not None
    assert github_sub.last_checked_at is not None
    assert github_sub.last_success_at is not None
    assert github_sub.last_error is None
    assert inactive_sub is not None
    assert inactive_sub.last_checked_at is None
    assert inactive_sub.last_success_at is None
    assert inactive_sub.last_error is None


def test_run_for_date_backfills_new_paper_venue_after_completion(monkeypatch, session_factory, tmp_path: Path) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.00001v1",
        title="Venue Later",
        pdf_url="https://arxiv.org/pdf/2404.00001v1.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(
        "app.services.venue_enrichment_service.fetch_arxiv_paper",
        lambda _arxiv_id, raise_on_error=True: {"journal_ref": "Nature"},
    )

    with Session(session_factory) as session:
        _configure_settings(session)
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        service = _make_service(session, tmp_path, {"arxiv": _FakeAdapter([candidate])})

        run = service.run_for_date(date(2026, 4, 18))
        paper = session.exec(select(Paper)).one()

    assert run.status == "completed"
    assert paper.venue == "Nature"
    assert paper.venue_resolution_status == "resolved"
    assert paper.venue_resolution_note == "resolved_from_arxiv_journal_ref"


def test_run_for_date_resumes_pending_venue_ranks_after_backfill(monkeypatch, session_factory, tmp_path: Path) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.00001v1",
        title="Resume Ranks",
        pdf_url="https://arxiv.org/pdf/2404.00001v1.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )
    resumed: list[str] = []

    monkeypatch.setattr(
        "app.services.venue_enrichment_service.fetch_arxiv_paper",
        lambda _arxiv_id, raise_on_error=True: {"journal_ref": "Cell"},
    )
    monkeypatch.setattr(
        "app.services.venue_rank_service.batch_refresh_venue_ranks",
        lambda _session, _api_key: resumed.append(_api_key) or {"total": 1, "success": 1, "no_data": 0, "error": 0, "pending": 0, "stopped_reason": ""},
    )

    with Session(session_factory) as session:
        _configure_settings(session)
        session.add(EasyScholarSettings(id=1, api_key="k-test", enabled=True))
        session.commit()
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        service = _make_service(session, tmp_path, {"arxiv": _FakeAdapter([candidate])})

        run = service.run_for_date(date(2026, 4, 18))

    assert run.status == "completed"
    assert resumed == ["k-test"]


def test_run_for_date_drops_rss_candidate_without_pdf_url_even_if_title_matches_existing(
    session_factory, tmp_path: Path
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="rss",
        external_id="rss-item-1",
        title="Same Paper From Feed",
        canonical_url="https://arxiv.org/abs/2404.00001v1",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )

    def fail_if_downloaded(url: str) -> bytes:
        raise AssertionError(f"unexpected download for {url}")

    with Session(session_factory) as session:
        _configure_settings(session)
        existing_path = tmp_path / "existing.pdf"
        existing_path.write_bytes(b"%PDF-1.4\n%%EOF\n")
        existing_paper = Paper(
            source="arxiv",
            source_id="2404.00001v1",
            title="Original Paper",
            local_pdf_path=str(existing_path),
            published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
        )
        session.add(existing_paper)
        session.commit()
        session.refresh(existing_paper)

        historical_run = DailyRun(
            run_date=date(2026, 4, 17),
            scheduled_for=datetime(2026, 4, 17, 0, 30, tzinfo=timezone.utc),
            status="completed",
            started_at=datetime(2026, 4, 17, 0, 30, tzinfo=timezone.utc),
            completed_at=datetime(2026, 4, 17, 0, 31, tzinfo=timezone.utc),
        )
        session.add(historical_run)
        session.commit()
        session.refresh(historical_run)
        session.add(
            IngestionItem(
                daily_run_id=historical_run.id,
                source_kind="arxiv",
                artifact_type="paper",
                title="Original Paper",
                canonical_url="https://arxiv.org/abs/2404.00001v1",
                fingerprint="historical",
                status="processed",
                paper_id=existing_paper.id,
            )
        )
        session.commit()

        _make_subscription(session, "rss", query="https://example.com/feed.xml")
        service = _make_service(
            session,
            tmp_path,
            {"rss": _FakeAdapter([candidate])},
            pdf_downloader=fail_if_downloaded,
        )

        run = service.run_for_date(date(2026, 4, 18))
        papers = session.exec(select(Paper)).all()
        items = session.exec(select(IngestionItem).where(IngestionItem.daily_run_id == run.id)).all()

    assert len(papers) == 1
    assert papers[0].id == existing_paper.id
    assert items == []
    stats = json.loads(run.stats_json)
    assert stats["skipped_no_pdf_url"] == 1
    assert stats["deduplicated"] == 0
    assert stats["candidates_total"] == 0


def test_run_for_date_drops_candidate_without_pdf_url_before_processing(
    session_factory,
    tmp_path: Path,
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="openreview",
        external_id="or-note-1",
        title="No PDF Paper",
        authors="Alice",
        abstract_raw="Missing PDF",
        canonical_url="https://openreview.net/forum?id=or-note-1",
    )

    with Session(session_factory) as session:
        _configure_settings(session)
        _make_subscription(session, "openreview", config={"venue": "ICLR"})
        service = _make_service(
            session,
            tmp_path,
            {"openreview": _FakeAdapter([candidate])},
        )

        run = service.run_for_date(date(2026, 4, 18))
        papers = session.exec(select(Paper)).all()
        items = session.exec(select(IngestionItem).where(IngestionItem.daily_run_id == run.id)).all()

    assert papers == []
    assert items == []
    stats = json.loads(run.stats_json)
    assert stats["failed_items"] == 0
    assert stats["skipped_no_pdf_url"] == 1
    assert stats["candidates_total"] == 0


def test_run_for_date_skips_restricted_pdf_without_failed_risk_item(
    session_factory,
    tmp_path: Path,
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="crossref",
        external_id="10.1234/restricted",
        title="Restricted PDF Paper",
        authors="Alice",
        abstract_raw="Metadata survives.",
        canonical_url="https://doi.org/10.1234/restricted",
        pdf_url="https://publisher.example.com/paper.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )

    def restricted_download(url: str) -> bytes:
        request = httpx.Request("GET", url)
        response = httpx.Response(403, request=request)
        response.raise_for_status()
        return b""

    with Session(session_factory) as session:
        _configure_settings(session)
        _make_subscription(session, "crossref", query="restricted")
        service = _make_service(
            session,
            tmp_path,
            {"crossref": _FakeAdapter([candidate])},
            pdf_downloader=restricted_download,
        )

        run = service.run_for_date(date(2026, 4, 18))
        items = session.exec(select(IngestionItem).where(IngestionItem.daily_run_id == run.id)).all()
        failed_items = DailyBriefingService().get_failed_items_for_run(session, run.id)

    assert len(items) == 1
    assert items[0].status == "skipped_restricted_pdf"
    assert items[0].paper_id is None
    assert failed_items == []
    stats = json.loads(run.stats_json)
    assert stats["failed_items"] == 0
    assert stats["skipped_restricted_pdf"] == 1


def test_briefing_formats_restricted_pdf_http_errors_as_manual_view_hint() -> None:
    service = DailyBriefingService()

    assert service.friendly_failure_reason("Client error '401 Unauthorized' for url") == (
        "源站限制直接下载 PDF，已保留候选信息，可通过原文链接手动查看。"
    )
    assert service.friendly_failure_reason("源站返回 HTTP 451，限制直接下载 PDF：https://example.com/paper.pdf") == (
        "源站限制直接下载 PDF，已保留候选信息，可通过原文链接手动查看。"
    )


def test_run_for_date_can_manage_default_database_session(
    session_factory,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="openreview",
        external_id="or-note-1",
        title="Sample Paper",
        authors="Alice",
        abstract_raw="With PDF",
        canonical_url="https://openreview.net/forum?id=or-note-1",
        pdf_url="https://openreview.net/pdf?id=or-note-1",
    )

    with Session(session_factory) as session:
        _configure_settings(session)
        _make_subscription(session, "openreview", config={"venue": "ICLR"})

    monkeypatch.setattr(daily_ingestion_module, "engine", session_factory, raising=False)
    service = DailyIngestionService(
        adapter_resolver=lambda kind: _FakeAdapter([candidate]),
        pipeline_service=_FakePipelineService(),
        storage_service=StorageService(root=str(tmp_path / "storage")),
        pdf_downloader=lambda _url: b"%PDF-1.4\n%%EOF\n",
    )

    run = service.run_for_date(date(2026, 4, 18), trigger_type="manual")

    with Session(session_factory) as session:
        persisted_run = session.get(DailyRun, run.id)
        item = session.exec(select(IngestionItem).where(IngestionItem.daily_run_id == run.id)).one()

    assert persisted_run is not None
    assert persisted_run.status == "completed"
    assert persisted_run.trigger_type == "manual"
    assert item.status == "processed"


def test_run_today_endpoint_triggers_manual_ingestion(client, monkeypatch: pytest.MonkeyPatch) -> None:
    background_calls: list[tuple[int, date]] = []

    def fake_background(run_id: int, run_date: date) -> None:
        background_calls.append((run_id, run_date))

    monkeypatch.setattr(
        automation_routes,
        "_run_ingestion_background",
        fake_background,
        raising=False,
    )

    response = client.post("/automation/runs/today")

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["run_id"] is not None
    assert len(background_calls) == 1
    assert background_calls[0][0] == body["run_id"]
    assert isinstance(background_calls[0][1], date)


def test_run_for_date_generates_daily_briefing_snapshot(session_factory, tmp_path: Path) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.20001",
        title="Briefing Ready Paper",
        authors="Alice",
        abstract_raw="Paper abstract",
        canonical_url="https://arxiv.org/abs/2404.20001",
        pdf_url="https://arxiv.org/pdf/2404.20001.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
        metadata={"topic": "agents"},
    )

    with Session(session_factory) as session:
        _configure_settings(session, schedule_time="08:30", timezone_name="Asia/Shanghai")
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        service = _make_service(
            session,
            tmp_path,
            {"arxiv": _FakeAdapter([candidate])},
        )

        run = service.run_for_date(date(2026, 4, 18))
        session.refresh(run)

        briefings = session.exec(select(DailyBriefing).where(DailyBriefing.daily_run_id == run.id)).all()
        paper_items = session.exec(select(DailyBriefingPaperItem)).all()
        project_items = session.exec(select(DailyBriefingProjectItem)).all()

    assert len(briefings) == 1
    briefing = briefings[0]
    assert briefing.briefing_date == date(2026, 4, 18)
    assert briefing.status == "completed"
    assert briefing.paper_count == 1
    assert briefing.project_count == 0
    assert briefing.source_count == 1
    assert briefing.summary_markdown
    assert len(paper_items) == 1
    assert paper_items[0].briefing_id == briefing.id
    assert paper_items[0].rank == 1
    assert paper_items[0].reason
    assert project_items == []


def test_run_for_date_briefing_counts_active_subscription_even_without_candidates(
    session_factory,
    tmp_path: Path,
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.20002",
        title="Only Candidate Paper",
        authors="Alice",
        abstract_raw="Paper abstract",
        canonical_url="https://arxiv.org/abs/2404.20002",
        pdf_url="https://arxiv.org/pdf/2404.20002.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )

    with Session(session_factory) as session:
        _configure_settings(session, schedule_time="08:30", timezone_name="Asia/Shanghai")
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        _make_subscription(session, "rss", query="https://example.com/empty.xml")
        service = _make_service(
            session,
            tmp_path,
            {
                "arxiv": _FakeAdapter([candidate]),
                "rss": _FakeAdapter([]),
            },
        )

        run = service.run_for_date(date(2026, 4, 18))
        session.refresh(run)

        briefing = session.exec(select(DailyBriefing).where(DailyBriefing.daily_run_id == run.id)).one()

    assert json.loads(run.stats_json)["subscriptions_total"] == 2
    assert briefing.source_count == 2


def test_manual_rerun_keeps_same_day_ready_papers_when_current_run_only_deduplicates(
    session_factory,
    tmp_path: Path,
) -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2404.30001",
        title="Same Day Paper",
        authors="Alice",
        abstract_raw="Paper abstract",
        canonical_url="https://arxiv.org/abs/2404.30001",
        pdf_url="https://arxiv.org/pdf/2404.30001.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
    )

    with Session(session_factory) as session:
        _configure_settings(session, schedule_time="08:30", timezone_name="Asia/Shanghai")
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        service = _make_service(
            session,
            tmp_path,
            {"arxiv": _FakeAdapter([candidate])},
        )

        first_run = service.run_for_date(date(2026, 4, 18))
        session.refresh(first_run)

        second_run = service.run_for_date(date(2026, 4, 18), trigger_type="manual")
        session.refresh(second_run)

        first_briefing = session.exec(select(DailyBriefing).where(DailyBriefing.daily_run_id == first_run.id)).one()
        second_briefing = session.exec(select(DailyBriefing).where(DailyBriefing.daily_run_id == second_run.id)).one()
        second_items = session.exec(
            select(DailyBriefingPaperItem).where(DailyBriefingPaperItem.briefing_id == second_briefing.id)
        ).all()
        second_run_ingestion_items = session.exec(
            select(IngestionItem).where(IngestionItem.daily_run_id == second_run.id)
        ).all()

    assert first_briefing.paper_count == 1
    assert second_run.trigger_type == "manual"
    assert len(second_run_ingestion_items) == 1
    assert second_run_ingestion_items[0].status == "deduplicated"
    assert second_briefing.paper_count == 1
    assert len(second_items) == 1
    assert second_items[0].paper_id == second_run_ingestion_items[0].paper_id


def test_run_for_date_populates_stats_json_with_major_counters(session_factory, tmp_path: Path) -> None:
    published_at = datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc)
    candidates = [
        SourceCandidate(
            artifact_type="paper",
            source_kind="arxiv",
            external_id="2404.10001",
            title="Fresh Paper",
            authors="Alice",
            pdf_url="https://arxiv.org/pdf/2404.10001.pdf",
            published_at=published_at,
        ),
        SourceCandidate(
            artifact_type="paper",
            source_kind="arxiv",
            title="Known Title",
            published_at=published_at,
        ),
        SourceCandidate(
            artifact_type="project",
            source_kind="arxiv",
            external_id="demo/project",
            title="Demo Project",
        ),
        SourceCandidate(
            artifact_type="paper",
            source_kind="arxiv",
            external_id="2404.10002",
            title="Missing PDF",
            published_at=published_at,
        ),
    ]

    with Session(session_factory) as session:
        _configure_settings(session)
        existing_path = tmp_path / "known-title.pdf"
        existing_path.write_bytes(b"%PDF-1.4\n%%EOF\n")
        existing_paper = Paper(
            source="manual",
            title="Known Title",
            local_pdf_path=str(existing_path),
            published_at=published_at,
        )
        session.add(existing_paper)
        session.commit()
        session.refresh(existing_paper)
        _make_subscription(session, "arxiv", query="cat:cs.AI")
        service = _make_service(
            session,
            tmp_path,
            {"arxiv": _FakeAdapter(candidates)},
        )

        run = service.run_for_date(date(2026, 4, 18))

    stats = json.loads(run.stats_json)
    assert stats == {
        "subscriptions_total": 1,
        "candidates_total": 2,
        "projects_found": 1,
        "papers_imported": 1,
        "deduplicated": 0,
        "failed_items": 0,
        "skipped_no_pdf_url": 2,
        "skipped_restricted_pdf": 0,
        "processed_papers": 1,
    }


def test_run_for_date_records_fetch_error_on_subscription(session_factory, tmp_path: Path) -> None:
    with Session(session_factory) as session:
        _configure_settings(session)
        sub = _make_subscription(session, "github_trending", config={"since": "daily"})
        service = _make_service(
            session,
            tmp_path,
            {"github_trending": _FailingAdapter(httpx.ConnectError("[WinError 10061] actively refused"))},
        )

        run = service.run_for_date(date(2026, 4, 18))
        session.refresh(run)
        sub = session.get(Subscription, sub.id)

    assert run.status == "completed"
    assert sub is not None
    assert sub.last_error is not None
    assert "10061" in sub.last_error


def test_run_for_date_keeps_openalex_source_venue_metadata(session_factory, tmp_path: Path) -> None:
    Path(tmp_path).mkdir(parents=True, exist_ok=True)
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="openalex",
        external_id="W4393148714",
        title="T2I-Adapter",
        pdf_url="https://example.com/t2i-adapter.pdf",
        published_at=datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc),
        metadata={
            "venue": "Proceedings of the AAAI Conference on Artificial Intelligence",
            "journal": "Proceedings of the AAAI Conference on Artificial Intelligence",
        },
    )

    with Session(session_factory) as session:
        _configure_settings(session)
        _make_subscription(session, "openalex", query="adapter")
        service = _make_service(session, tmp_path, {"openalex": _FakeAdapter([candidate])})

        run = service.run_for_date(date(2026, 4, 18))
        paper = session.exec(select(Paper)).one()

    assert run.status == "completed"
    assert paper.venue == "Proceedings of the AAAI Conference on Artificial Intelligence"
    assert paper.venue_resolution_status == "resolved"
    assert paper.venue_resolution_note == "source_metadata"
