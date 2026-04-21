from datetime import date, datetime, timezone
import json

from sqlalchemy import or_
from sqlmodel import Session, select

from app.models.daily_briefing import (
    DailyBriefing,
    DailyBriefingPaperItem,
    DailyBriefingProjectItem,
)
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.paper_summary import PaperSummary


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DailyBriefingService:
    def generate_for_run(
        self,
        session: Session,
        run: DailyRun,
        *,
        top_n: int,
        project_sidebar_enabled: bool,
    ) -> DailyBriefing:
        items = list(
            session.exec(
                select(IngestionItem)
                .where(IngestionItem.daily_run_id == run.id)
                .order_by(IngestionItem.id.asc())
            ).all()
        )

        paper_candidates: list[tuple[IngestionItem, Paper, PaperSummary | None, float, str]] = []
        source_kinds: set[str] = set()
        project_items: list[IngestionItem] = []

        for item in items:
            if item.source_kind:
                source_kinds.add(item.source_kind)
            if item.artifact_type == "project":
                if project_sidebar_enabled and item.status == "processed":
                    project_items.append(item)
                continue
            if item.paper_id is None:
                continue

            paper = session.get(Paper, item.paper_id)
            if paper is None:
                continue
            if paper.status != "ready" or paper.summary_status != "completed":
                continue

            summary = session.exec(
                select(PaperSummary).where(PaperSummary.paper_id == paper.id)
            ).first()
            score = self._score_paper(paper, summary)
            reason = self._reason_for_paper(paper, summary)
            paper_candidates.append((item, paper, summary, score, reason))

        paper_candidates.sort(key=lambda row: row[3], reverse=True)
        top_papers = paper_candidates[:top_n]

        briefing = DailyBriefing(
            daily_run_id=run.id,
            briefing_date=run.run_date,
            status="completed",
            generated_at=_utcnow(),
            top_n=top_n,
            summary_markdown=self._build_summary_markdown(run.run_date, top_papers, project_items),
            paper_count=len(top_papers),
            project_count=len(project_items),
            source_count=len(source_kinds),
            fallback_used=False,
            metadata_json=json.dumps(
                {
                    "paper_candidates": len(paper_candidates),
                    "project_candidates": len(project_items),
                },
                ensure_ascii=False,
            ),
        )
        session.add(briefing)
        session.flush()

        for rank, (item, paper, summary, score, reason) in enumerate(top_papers, start=1):
            session.add(
                DailyBriefingPaperItem(
                    briefing_id=briefing.id,
                    paper_id=paper.id,
                    ingestion_item_id=item.id,
                    rank=rank,
                    score=score,
                    reason=reason,
                    source_kind=item.source_kind,
                    title=paper.title,
                    authors=paper.authors,
                    summary_text=(summary.one_line_summary if summary is not None else reason),
                    canonical_url=item.canonical_url or paper.pdf_url,
                    pdf_url=paper.pdf_url,
                    published_at=paper.published_at,
                    metadata_json=json.dumps({}, ensure_ascii=False),
                )
            )

        for rank, item in enumerate(project_items, start=1):
            session.add(
                DailyBriefingProjectItem(
                    briefing_id=briefing.id,
                    ingestion_item_id=item.id,
                    rank=rank,
                    title=item.title,
                    url=item.canonical_url,
                    summary=item.abstract_raw,
                    source_kind=item.source_kind,
                    project_key=item.external_id or item.canonical_url or item.title,
                    metadata_json=item.metadata_json,
                )
            )

        session.commit()
        session.refresh(briefing)
        return briefing

    def _score_paper(self, paper: Paper, summary: PaperSummary | None) -> float:
        score = 100.0
        score += max(0.0, float(paper.category_confidence or 0.0) * 20.0)
        if summary is not None:
            if summary.one_line_summary:
                score += 10.0
            if summary.relevance_note:
                score += 15.0
            if summary.core_contributions:
                score += 10.0
            if summary.method_summary:
                score += 5.0
        if paper.source == "arxiv":
            score += 3.0
        return score

    def _reason_for_paper(self, paper: Paper, summary: PaperSummary | None) -> str:
        if summary is not None and summary.relevance_note:
            return summary.relevance_note
        if summary is not None and summary.one_line_summary:
            return summary.one_line_summary
        if paper.category_status == "manual_locked":
            return "已完成处理，并已人工确认分类"
        if paper.category_confidence >= 0.8:
            return "已完成摘要与自动分类，建议优先阅读"
        return "已完成摘要处理，适合进入今日阅读清单"

    def _build_summary_markdown(
        self,
        briefing_date: date,
        top_papers: list[tuple[IngestionItem, Paper, PaperSummary | None, float, str]],
        project_items: list[IngestionItem],
    ) -> str:
        if not top_papers:
            return (
                f"# {briefing_date.isoformat()} 每日速览\n\n"
                "今日自动化已完成，但暂无满足条件的已处理论文。"
            )

        lines = [
            f"# {briefing_date.isoformat()} 每日速览",
            "",
            f"今日共筛出 {len(top_papers)} 篇优先论文，相关项目 {len(project_items)} 个。",
            "",
            "## 今日精选",
        ]
        for rank, (_item, paper, summary, _score, reason) in enumerate(top_papers, start=1):
            headline = summary.one_line_summary if summary is not None and summary.one_line_summary else reason
            lines.extend(
                [
                    "",
                    f"### {rank}. {paper.title}",
                    f"- 推荐理由：{reason}",
                    f"- 摘要亮点：{headline}",
                ]
            )
        return "\n".join(lines)

    def get_briefing_by_date(
        self,
        session: Session,
        briefing_date: date,
    ) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing)
            .where(DailyBriefing.briefing_date == briefing_date)
            .order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_latest_successful(self, session: Session) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing)
            .where(DailyBriefing.status == "completed")
            .order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_history(self, session: Session, days: int = 7) -> list[DailyBriefing]:
        limit = max(1, min(days, 30))
        rows = session.exec(
            select(DailyBriefing).order_by(
                DailyBriefing.briefing_date.desc(),
                DailyBriefing.generated_at.desc(),
            )
        ).all()
        by_date: list[DailyBriefing] = []
        seen: set[date] = set()
        for briefing in rows:
            if briefing.briefing_date in seen:
                continue
            seen.add(briefing.briefing_date)
            by_date.append(briefing)
            if len(by_date) >= limit:
                break
        return by_date

    def get_paper_items(
        self,
        session: Session,
        briefing_id: int,
    ) -> list[DailyBriefingPaperItem]:
        return list(
            session.exec(
                select(DailyBriefingPaperItem)
                .where(
                    or_(
                        DailyBriefingPaperItem.briefing_id == briefing_id,
                        DailyBriefingPaperItem.daily_briefing_id == briefing_id,
                    )
                )
                .order_by(DailyBriefingPaperItem.rank.asc(), DailyBriefingPaperItem.rank_order.asc())
            ).all()
        )

    def get_project_items(
        self,
        session: Session,
        briefing_id: int,
    ) -> list[DailyBriefingProjectItem]:
        return list(
            session.exec(
                select(DailyBriefingProjectItem)
                .where(
                    or_(
                        DailyBriefingProjectItem.briefing_id == briefing_id,
                        DailyBriefingProjectItem.daily_briefing_id == briefing_id,
                    )
                )
                .order_by(DailyBriefingProjectItem.rank.asc(), DailyBriefingProjectItem.sort_order.asc())
            ).all()
        )
