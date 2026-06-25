from datetime import datetime, timezone

import pytest
from sqlmodel import SQLModel, Session, create_engine

from app.models.paper import Paper
from app.services.venue_enrichment_service import (
    batch_backfill_missing_venues,
    get_venue_backfill_status,
    resolve_paper_venue,
)


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    yield engine


def _make_paper(session: Session, **kwargs) -> Paper:
    paper = Paper(
        source=kwargs.get("source", "arxiv"),
        source_id=kwargs.get("source_id", "2404.00001"),
        title=kwargs.get("title", "Test Paper"),
        local_pdf_path=kwargs.get("local_pdf_path", "/tmp/test.pdf"),
        pdf_url=kwargs.get("pdf_url", "https://arxiv.org/pdf/2404.00001.pdf"),
        venue=kwargs.get("venue", ""),
        published_at=kwargs.get("published_at", datetime.now(timezone.utc)),
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def test_resolve_paper_venue_marks_existing_venue_resolved(session_factory) -> None:
    with Session(session_factory) as session:
        paper = _make_paper(session, venue="ICML")

        result = resolve_paper_venue(session, paper)
        session.refresh(paper)

    assert result.status == "resolved"
    assert paper.venue == "ICML"
    assert paper.venue_resolution_status == "resolved"
    assert paper.venue_resolution_note == "existing_venue"


def test_resolve_paper_venue_uses_arxiv_journal_ref(monkeypatch, session_factory) -> None:
    with Session(session_factory) as session:
        paper = _make_paper(session, source="arxiv", source_id="2404.00001")

        monkeypatch.setattr(
            "app.services.venue_enrichment_service.fetch_arxiv_paper",
            lambda _arxiv_id, raise_on_error=True: {"journal_ref": "Nature Machine Intelligence"},
        )

        result = resolve_paper_venue(session, paper)
        session.refresh(paper)

    assert result.status == "resolved"
    assert paper.venue == "Nature Machine Intelligence"
    assert paper.venue_resolution_status == "resolved"
    assert paper.venue_resolution_note == "resolved_from_arxiv_journal_ref"


def test_resolve_paper_venue_rejects_low_confidence_preprint(monkeypatch, session_factory) -> None:
    with Session(session_factory) as session:
        paper = _make_paper(session, source="arxiv", source_id="2404.00001")

        monkeypatch.setattr(
            "app.services.venue_enrichment_service.fetch_arxiv_paper",
            lambda _arxiv_id, raise_on_error=True: {"journal_ref": "arXiv preprint arXiv:2404.00001"},
        )
        monkeypatch.setattr(
            "app.services.venue_enrichment_service._search_openalex_work",
            lambda **kwargs: {},
        )

        result = resolve_paper_venue(session, paper)
        session.refresh(paper)

    assert result.status == "no_match"
    assert paper.venue == ""
    assert paper.venue_resolution_status == "no_match"


def test_resolve_paper_venue_falls_back_to_openalex_when_arxiv_has_no_journal_ref(monkeypatch, session_factory) -> None:
    with Session(session_factory) as session:
        paper = _make_paper(session, source="hf_papers", source_id="2404.00001")

        monkeypatch.setattr(
            "app.services.venue_enrichment_service.fetch_arxiv_paper",
            lambda _arxiv_id, raise_on_error=True: {"journal_ref": ""},
        )
        monkeypatch.setattr(
            "app.services.venue_enrichment_service._search_openalex_work",
            lambda **kwargs: {"primary_location": {"source": {"display_name": "Proceedings of the AAAI Conference on Artificial Intelligence"}}},
        )

        result = resolve_paper_venue(session, paper)
        session.refresh(paper)

    assert result.status == "resolved"
    assert result.note == "resolved_from_openalex_fallback"
    assert paper.venue == "Proceedings of the AAAI Conference on Artificial Intelligence"
    assert paper.venue_resolution_status == "resolved"


def test_batch_backfill_missing_venues_skips_no_source_and_summarizes(monkeypatch, session_factory) -> None:
    with Session(session_factory) as session:
        resolved = _make_paper(session, source="hf_papers", source_id="2404.00001", pdf_url="")
        unsupported = _make_paper(session, source="manual", source_id="", pdf_url="")

        monkeypatch.setattr(
            "app.services.venue_enrichment_service.fetch_arxiv_paper",
            lambda _arxiv_id, raise_on_error=True: {"journal_ref": "Science Robotics"},
        )

        summary = batch_backfill_missing_venues(session)
        session.refresh(resolved)
        session.refresh(unsupported)

    assert summary == {"total": 2, "resolved": 1, "no_source": 1, "no_match": 0, "error": 0}
    assert resolved.venue == "Science Robotics"
    assert unsupported.venue_resolution_status == "no_source"


def test_get_venue_backfill_status_counts_missing_and_supported(session_factory) -> None:
    with Session(session_factory) as session:
        _make_paper(session, source="arxiv", source_id="2404.00001", venue="ICLR")
        _make_paper(session, source="arxiv", source_id="2404.00002", venue="")
        _make_paper(session, source="manual", source_id="", pdf_url="", venue="")

        status = get_venue_backfill_status(session)

    assert status["resolved"] == 1
    assert status["missing_total"] == 2
    assert status["supported_missing"] == 1
    assert status["pending"] == 2
