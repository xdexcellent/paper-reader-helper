"""Statistics API: real data from the database."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.db import get_session
from app.models.paper import Paper

router = APIRouter(prefix="/stats", tags=["stats"])


class StatsOverviewResponse(BaseModel):
    total: int
    ready: int
    parsed: int
    summarized: int
    pending: int
    processing: int
    completion_rate: float


class DailyStatsItem(BaseModel):
    date: str
    count: int


class SourceDistItem(BaseModel):
    source: str
    count: int


@router.get("/overview", response_model=StatsOverviewResponse)
def get_overview(db: Session = Depends(get_session)) -> StatsOverviewResponse:
    papers = list(db.exec(select(Paper)).all())
    total = len(papers)
    ready = sum(1 for p in papers if p.status == "ready")
    parsed = sum(1 for p in papers if p.parse_status == "completed")
    summarized = sum(1 for p in papers if p.summary_status == "completed")
    pending = sum(1 for p in papers if p.status == "queued")
    processing = sum(1 for p in papers if p.status in ("parsing", "summarizing"))
    completion_rate = round((ready / total) * 100, 1) if total > 0 else 0

    return StatsOverviewResponse(
        total=total,
        ready=ready,
        parsed=parsed,
        summarized=summarized,
        pending=pending,
        processing=processing,
        completion_rate=completion_rate,
    )


@router.get("/daily", response_model=list[DailyStatsItem])
def get_daily_stats(
    days: int = 7, db: Session = Depends(get_session)
) -> list[DailyStatsItem]:
    """Return paper import counts per day for the last N days."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    papers = list(
        db.exec(select(Paper).where(Paper.created_at >= start)).all()
    )

    # Group by date
    date_counts: dict[str, int] = {}
    for i in range(days):
        d = (now - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        date_counts[d] = 0

    for p in papers:
        d = p.created_at.strftime("%Y-%m-%d")
        if d in date_counts:
            date_counts[d] += 1

    return [DailyStatsItem(date=k, count=v) for k, v in date_counts.items()]


@router.get("/sources", response_model=list[SourceDistItem])
def get_source_distribution(
    db: Session = Depends(get_session),
) -> list[SourceDistItem]:
    """Return paper count by source."""
    papers = list(db.exec(select(Paper)).all())
    source_counts: dict[str, int] = {}
    for p in papers:
        source_counts[p.source] = source_counts.get(p.source, 0) + 1

    return sorted(
        [SourceDistItem(source=k, count=v) for k, v in source_counts.items()],
        key=lambda x: x.count,
        reverse=True,
    )
