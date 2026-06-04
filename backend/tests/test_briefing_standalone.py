"""Regression tests for daily briefing generation behavior."""
from datetime import date, datetime, timezone

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.daily_briefing import DailyBriefing, DailyBriefingPaperItem, DailyBriefingProjectItem
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.paper_summary import PaperSummary
from app.models.subscription import Subscription
from app.services.category_service import ensure_default_categories
from app.services.daily_briefing_service import DailyBriefingService


@pytest.fixture(autouse=True)
def disable_network_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.deepseek_client.DeepSeekClient.chat", lambda *_args, **_kwargs: "")
    monkeypatch.setattr("app.services.deepseek_client.DeepSeekClient.translate_to_chinese", lambda _self, text: text)


def _make_engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        ensure_default_categories(s)
    return eng


def test_briefing_includes_manually_imported_ready_paper() -> None:
    """A paper added via manual import (no IngestionItem) must appear in the briefing."""
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        paper = Paper(
            title="Manual Import Paper",
            source="manual",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            ready_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
        )
        session.add(paper)
        session.flush()

        session.add(PaperSummary(
            paper_id=paper.id,
            one_line_summary="A great manual import paper",
            relevance_note="Relevant",
        ))
        session.commit()
        session.refresh(run)
        paper_id = paper.id

        svc = DailyBriefingService()
        briefing = svc.generate_for_run(
            session, run, top_n=5, project_sidebar_enabled=False,
        )

        items = session.exec(
            select(DailyBriefingPaperItem).where(DailyBriefingPaperItem.briefing_id == briefing.id)
        ).all()

    assert briefing.paper_count == 1
    assert len(items) == 1
    assert items[0].paper_id == paper_id
    assert items[0].ingestion_item_id is None
    assert items[0].source_kind == "manual"


def test_briefing_includes_both_ingested_and_standalone_papers() -> None:
    """When both ingested and manually imported papers exist, both should appear."""
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        # Paper via ingestion
        ingested_paper = Paper(
            title="Ingested Paper",
            source="arxiv",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            created_at=datetime(2026, 4, 20, 8, 0, tzinfo=timezone.utc),
        )
        session.add(ingested_paper)
        session.flush()

        from app.models.ingestion_item import IngestionItem

        ing = IngestionItem(
            daily_run_id=run.id,
            source_kind="arxiv",
            artifact_type="paper",
            title="Ingested Paper",
            status="processed",
            paper_id=ingested_paper.id,
        )
        session.add(ing)
        session.flush()

        # Paper via manual import (no IngestionItem)
        manual_paper = Paper(
            title="Manual Paper",
            source="manual",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            ready_at=datetime(2026, 4, 20, 11, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
        )
        session.add(manual_paper)
        session.commit()
        session.refresh(run)
        ingested_paper_id = ingested_paper.id
        manual_paper_id = manual_paper.id

        svc = DailyBriefingService()
        briefing = svc.generate_for_run(
            session, run, top_n=5, project_sidebar_enabled=False,
        )

        items = session.exec(
            select(DailyBriefingPaperItem)
            .where(DailyBriefingPaperItem.briefing_id == briefing.id)
            .order_by(DailyBriefingPaperItem.rank)
        ).all()

    assert briefing.paper_count == 2
    assert len(items) == 2
    paper_ids = {i.paper_id for i in items}
    assert ingested_paper_id in paper_ids
    assert manual_paper_id in paper_ids


def test_briefing_excludes_papers_from_other_dates() -> None:
    """Only papers created/ready on the briefing date should be included as standalone."""
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        # Paper from yesterday
        old_paper = Paper(
            title="Yesterday Paper",
            source="manual",
            local_pdf_path="",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            ready_at=datetime(2026, 4, 19, 10, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 19, 9, 0, tzinfo=timezone.utc),
        )
        session.add(old_paper)
        session.commit()
        session.refresh(run)

        svc = DailyBriefingService()
        briefing = svc.generate_for_run(
            session, run, top_n=5, project_sidebar_enabled=False,
        )

    assert briefing.paper_count == 0


def test_briefing_keeps_all_daily_papers_even_when_top_n_is_small() -> None:
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        sub = Subscription(
            name="arxiv-sub",
            type="arxiv",
            source_kind="arxiv",
            display_name="arxiv",
            query="cat:cs.AI",
            fetch_limit=10,
        )
        session.add(sub)
        session.flush()

        for index in range(2):
            paper = Paper(
                title=f"Paper {index + 1}",
                source="arxiv",
                local_pdf_path="",
                status="ready",
                parse_status="completed",
                summary_status="completed",
                ready_at=datetime(2026, 4, 20, 10 + index, 0, tzinfo=timezone.utc),
                created_at=datetime(2026, 4, 20, 9 + index, 0, tzinfo=timezone.utc),
            )
            session.add(paper)
            session.flush()
            session.add(PaperSummary(
                paper_id=paper.id,
                one_line_summary=f"Paper {index + 1} summary",
                relevance_note=f"Paper {index + 1} relevance",
            ))
            session.add(
                IngestionItem(
                    daily_run_id=run.id,
                    subscription_id=sub.id,
                    source_kind="arxiv",
                    artifact_type="paper",
                    title=paper.title,
                    status="processed",
                    paper_id=paper.id,
                )
            )
        session.commit()
        session.refresh(run)

        svc = DailyBriefingService()
        briefing = svc.generate_for_run(session, run, top_n=1, project_sidebar_enabled=False)
        items = session.exec(
            select(DailyBriefingPaperItem)
            .where(DailyBriefingPaperItem.briefing_id == briefing.id)
            .order_by(DailyBriefingPaperItem.rank.asc())
        ).all()

    assert briefing.paper_count == 2
    assert len(items) == 2
    assert "Paper 1" in briefing.summary_markdown
    assert "Paper 2" in briefing.summary_markdown


def test_briefing_markdown_uses_report_sections_and_paper_links_when_llm_unavailable() -> None:
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        sub = Subscription(
            name="arxiv-sub",
            type="arxiv",
            source_kind="arxiv",
            display_name="arxiv",
            query="cat:cs.AI",
            fetch_limit=10,
        )
        session.add(sub)
        session.flush()

        paper = Paper(
            title="SpeechParaling-Bench: A Comprehensive Benchmark",
            source="arxiv",
            local_pdf_path="",
            pdf_url="https://arxiv.org/pdf/2604.00001",
            status="ready",
            parse_status="completed",
            summary_status="completed",
            ready_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
        )
        session.add(paper)
        session.flush()
        session.add(PaperSummary(
            paper_id=paper.id,
            one_line_summary="覆盖副语言感知与可控语音生成评测。",
            relevance_note="适合关注多模态生成评测的读者优先阅读。",
        ))
        session.add(
            IngestionItem(
                daily_run_id=run.id,
                subscription_id=sub.id,
                source_kind="arxiv",
                artifact_type="paper",
                title=paper.title,
                canonical_url="https://arxiv.org/abs/2604.00001",
                pdf_url="https://arxiv.org/pdf/2604.00001",
                status="processed",
                paper_id=paper.id,
            )
        )
        session.commit()
        session.refresh(run)

        service = DailyBriefingService()
        service._deepseek.api_key = ""  # type: ignore[attr-defined]
        briefing = service.generate_for_run(session, run, top_n=1, project_sidebar_enabled=False)

    markdown = briefing.summary_markdown
    assert "LLM 深度综述生成失败" in markdown
    assert "## 今日概览" in markdown
    assert "## 热点方向" in markdown
    assert "## Top 5 深度点评" in markdown
    assert "[论文1](https://arxiv.org/abs/2604.00001)" in markdown


def test_briefing_counts_subscriptions_not_source_kind() -> None:
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
            stats_json='{"subscriptions_total": 2}',
        )
        session.add(run)
        session.flush()

        for index in range(2):
            sub = Subscription(
                name=f"arxiv-sub-{index}",
                type="arxiv",
                source_kind="arxiv",
                display_name=f"arxiv-{index}",
                query=f"topic-{index}",
                fetch_limit=10,
            )
            session.add(sub)
            session.flush()
            paper = Paper(
                title=f"Sub Paper {index + 1}",
                source="arxiv",
                local_pdf_path="",
                status="ready",
                parse_status="completed",
                summary_status="completed",
                created_at=datetime(2026, 4, 20, 8 + index, 0, tzinfo=timezone.utc),
            )
            session.add(paper)
            session.flush()
            session.add(PaperSummary(
                paper_id=paper.id,
                one_line_summary=f"Summary {index + 1}",
                relevance_note=f"Relevant {index + 1}",
            ))
            session.add(
                IngestionItem(
                    daily_run_id=run.id,
                    subscription_id=sub.id,
                    source_kind="arxiv",
                    artifact_type="paper",
                    title=paper.title,
                    status="processed",
                    paper_id=paper.id,
                )
            )
        session.commit()
        session.refresh(run)

        briefing = DailyBriefingService().generate_for_run(session, run, top_n=5, project_sidebar_enabled=False)

    assert briefing.source_count == 2


def test_project_summary_falls_back_to_chinese_when_translation_keeps_english() -> None:
    eng = _make_engine()
    run_date = date(2026, 4, 20)

    with Session(eng) as session:
        run = DailyRun(
            run_date=run_date,
            scheduled_for=datetime(2026, 4, 20, 0, 30, tzinfo=timezone.utc),
            status="completed",
        )
        session.add(run)
        session.flush()

        session.add(
            IngestionItem(
                daily_run_id=run.id,
                source_kind="github_trending",
                artifact_type="project",
                title="openai/codex",
                canonical_url="https://github.com/openai/codex",
                abstract_raw="AI coding agent for complex repositories.",
                metadata_json='{"language":"Python","stars":1234}',
                status="processed",
            )
        )
        session.commit()
        session.refresh(run)

        service = DailyBriefingService()
        service._deepseek.translate_to_chinese = lambda text: text  # type: ignore[method-assign]
        briefing = service.generate_for_run(session, run, top_n=5, project_sidebar_enabled=True)
        items = session.exec(
            select(DailyBriefingProjectItem)
            .where(DailyBriefingProjectItem.briefing_id == briefing.id)
        ).all()

    assert briefing.project_count == 1
    assert len(items) == 1
    assert items[0].summary != "AI coding agent for complex repositories."
    assert "项目" in items[0].summary
