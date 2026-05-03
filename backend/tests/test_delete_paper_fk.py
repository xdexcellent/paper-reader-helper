"""Regression tests: deleting a paper with all FK references must succeed."""
from datetime import datetime, timezone

from sqlmodel import Session, SQLModel, create_engine, select

from app.models.chat_message import ChatMessageRecord
from app.models.chat_session import ChatSession
from app.models.daily_briefing import DailyBriefing, DailyBriefingPaperItem
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_embedding import PaperEmbedding
from app.models.paper_summary import PaperSummary
from app.services.category_service import ensure_default_categories


def _engine_with_fk():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})

    from sqlalchemy import event

    @event.listens_for(eng, "connect")
    def _enable_fk(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        ensure_default_categories(s)
    return eng


def _seed_paper_with_all_refs(session: Session) -> int:
    """Create a paper with every FK-referencing table populated."""
    paper = Paper(
        title="FK Test Paper",
        source="manual",
        local_pdf_path="",
        status="ready",
        parse_status="completed",
        summary_status="completed",
    )
    session.add(paper)
    session.flush()

    session.add(PaperContent(paper_id=paper.id, full_markdown="# Content"))
    session.add(PaperSummary(paper_id=paper.id, one_line_summary="Summary"))
    session.add(PaperEmbedding(paper_id=paper.id, embedding_json="[0.1]"))

    cs = ChatSession(paper_id=paper.id, title="Test Chat")
    session.add(cs)
    session.flush()
    session.add(ChatMessageRecord(session_id=cs.id, role="user", content="hi"))
    session.add(ChatMessageRecord(session_id=cs.id, role="assistant", content="hello"))

    run = DailyRun(
        run_date=datetime(2026, 4, 18).date(),
        scheduled_for=datetime(2026, 4, 18, 0, 30, tzinfo=timezone.utc),
        status="completed",
    )
    session.add(run)
    session.flush()

    ing = IngestionItem(
        daily_run_id=run.id,
        source_kind="arxiv",
        artifact_type="paper",
        title="FK Test Paper",
        status="processed",
        paper_id=paper.id,
    )
    session.add(ing)
    session.flush()

    briefing = DailyBriefing(
        daily_run_id=run.id,
        briefing_date=run.run_date,
        status="completed",
        generated_at=datetime(2026, 4, 18, 12, 0, tzinfo=timezone.utc),
        top_n=5,
        summary_markdown="test",
        paper_count=1,
    )
    session.add(briefing)
    session.flush()

    session.add(
        DailyBriefingPaperItem(
            briefing_id=briefing.id,
            paper_id=paper.id,
            ingestion_item_id=ing.id,
            rank=1,
            score=100.0,
            reason="test",
            source_kind="arxiv",
        )
    )
    session.commit()
    return paper.id


def test_delete_paper_cleans_all_fk_references() -> None:
    """DELETE /papers/{id} must not raise IntegrityError when FK refs exist."""
    eng = _engine_with_fk()

    with Session(eng) as session:
        paper_id = _seed_paper_with_all_refs(session)

    # Use the API handler directly (avoids needing full TestClient wiring)
    from app.api.routes.papers import delete_paper

    with Session(eng) as session:
        result = delete_paper(paper_id, session=session)

    assert result == {"success": True}

    with Session(eng) as session:
        assert session.get(Paper, paper_id) is None
        assert session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first() is None
        assert session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).first() is None
        assert session.exec(select(PaperEmbedding).where(PaperEmbedding.paper_id == paper_id)).first() is None
        assert session.exec(select(ChatSession).where(ChatSession.paper_id == paper_id)).all() == []
        assert session.exec(select(DailyBriefingPaperItem).where(DailyBriefingPaperItem.paper_id == paper_id)).all() == []
        # IngestionItem should be preserved but paper_id nullified
        ing_items = session.exec(select(IngestionItem)).all()
        assert len(ing_items) == 1
        assert ing_items[0].paper_id is None


def test_delete_paper_without_refs_succeeds() -> None:
    """DELETE on a paper with no FK dependents should also succeed."""
    eng = _engine_with_fk()

    with Session(eng) as session:
        paper = Paper(title="Bare Paper", source="manual", local_pdf_path="")
        session.add(paper)
        session.commit()
        paper_id = paper.id

    from app.api.routes.papers import delete_paper

    with Session(eng) as session:
        result = delete_paper(paper_id, session=session)

    assert result == {"success": True}
