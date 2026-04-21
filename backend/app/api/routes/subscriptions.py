"""Subscription management API: arXiv search and subscription CRUD."""

import json
import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.subscription import Subscription
from app.services.arxiv_client import search_arxiv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

QUERY_REQUIRED_SOURCE_KINDS = {"arxiv", "rss"}
SupportedSourceKind = Literal[
    "arxiv",
    "rss",
    "openreview",
    "hf_papers",
    "github_trending",
]


# ─── Schemas ─────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    name: str
    query: str = ""
    type: SupportedSourceKind | None = None
    source_kind: SupportedSourceKind | None = None
    display_name: str | None = None
    config: dict = Field(default_factory=dict)
    fetch_limit: int = Field(default=10, ge=1, le=20)

    @model_validator(mode="after")
    def validate_create_payload(self) -> "SubscriptionCreate":
        resolved_source_kind = self.source_kind or self.type or "arxiv"
        if self.source_kind and self.type and self.source_kind != self.type:
            raise ValueError("type and source_kind must match when both are provided")
        if resolved_source_kind in QUERY_REQUIRED_SOURCE_KINDS and not self.query.strip():
            raise ValueError(
                f"query is required for supported source_kind '{resolved_source_kind}'"
            )
        return self


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    type: str
    source_kind: str
    display_name: str
    query: str
    config: dict
    fetch_limit: int
    is_active: bool
    last_checked_at: str | None
    last_success_at: str | None
    last_error: str | None
    created_at: str


class ArxivPaperPreview(BaseModel):
    title: str
    authors: str
    abstract: str
    pdf_url: str
    arxiv_id: str
    published: str


# ─── Routes ──────────────────────────────────────────────────

@router.post("", response_model=SubscriptionResponse, status_code=201)
def create_subscription(
    req: SubscriptionCreate, db: Session = Depends(get_session)
) -> SubscriptionResponse:
    source_kind = req.source_kind or req.type or "arxiv"
    sub = Subscription(
        name=req.name,
        type=source_kind,
        source_kind=source_kind,
        display_name=req.display_name or req.name,
        query=req.query.strip(),
        config_json=json.dumps(req.config, ensure_ascii=False),
        fetch_limit=req.fetch_limit,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _to_response(sub)


@router.get("", response_model=list[SubscriptionResponse])
def list_subscriptions(db: Session = Depends(get_session)) -> list[SubscriptionResponse]:
    subs = db.exec(select(Subscription).order_by(Subscription.created_at.desc())).all()
    return [_to_response(s) for s in subs]


@router.delete("/{sub_id}")
def delete_subscription(sub_id: int, db: Session = Depends(get_session)) -> dict:
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="订阅不存在")
    db.delete(sub)
    db.commit()
    return {"success": True}


@router.post("/{sub_id}/fetch", response_model=list[ArxivPaperPreview])
def fetch_subscription(sub_id: int, db: Session = Depends(get_session)) -> list[ArxivPaperPreview]:
    """Manually fetch latest papers for a subscription."""
    sub = db.get(Subscription, sub_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="订阅不存在")

    source_kind = sub.source_kind or sub.type
    if source_kind != "arxiv":
        raise HTTPException(status_code=400, detail="目前仅支持 arXiv 手动抓取")

    papers = search_arxiv(sub.query, max_results=sub.fetch_limit)

    now = datetime.now(timezone.utc)
    sub.last_checked_at = now
    sub.last_success_at = now
    sub.last_error = None
    db.add(sub)
    db.commit()

    return [ArxivPaperPreview(**p) for p in papers]


@router.get("/preview", response_model=list[ArxivPaperPreview])
def preview_search(
    type: str = Query(default="arxiv"),
    query: str = Query(...),
    max_results: int = Query(default=5, le=20),
) -> list[ArxivPaperPreview]:
    """Preview search results without creating a subscription."""
    if type != "arxiv":
        raise HTTPException(status_code=400, detail="目前仅支持 arXiv 搜索")

    papers = search_arxiv(query, max_results=max_results)
    return [ArxivPaperPreview(**p) for p in papers]


def _to_response(s: Subscription) -> SubscriptionResponse:
    return SubscriptionResponse(
        id=s.id,
        name=s.name,
        type=s.type,
        source_kind=s.source_kind or s.type,
        display_name=s.display_name or s.name,
        query=s.query,
        config=s.config,
        fetch_limit=s.fetch_limit,
        is_active=s.is_active,
        last_checked_at=s.last_checked_at.isoformat() if s.last_checked_at else None,
        last_success_at=s.last_success_at.isoformat() if s.last_success_at else None,
        last_error=s.last_error,
        created_at=s.created_at.isoformat(),
    )
