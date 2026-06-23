import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.category import Category
from app.models.paper import CategoryStatus, Paper
from app.schemas.category import CategoryCreateRequest, CategoryResponse
from app.services.category_service import (
    create_category,
    ensure_default_categories,
    list_categories_with_counts,
    update_paper_category,
)
from app.services.deepseek_client import DeepSeekClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
def get_categories(session: Session = Depends(get_session)) -> list[dict]:
    ensure_default_categories(session)
    return list_categories_with_counts(session)


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category_directory(
    payload: CategoryCreateRequest,
    session: Session = Depends(get_session),
) -> dict:
    ensure_default_categories(session)
    try:
        category = create_category(session, payload.name, payload.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "parent_id": category.parent_id,
        "description": category.description,
        "is_system": category.is_system,
        "is_active": category.is_active,
        "is_pending_bucket": category.is_pending_bucket,
        "sort_order": category.sort_order,
        "paper_count": 0,
        "pending_count": 0,
    }


@router.post("/auto-classify")
def auto_classify_pending_papers(session: Session = Depends(get_session)) -> dict:
    """Use AI to classify papers in the '待确认' bucket and clean up empty categories.

    Steps:
    1. Find all papers with category_status='pending_review'
    2. Call AI to suggest a category for each (batch by 10)
    3. Auto-create new categories if AI suggests one that doesn't exist
    4. Delete non-system categories that have 0 papers after reclassification
    """
    ensure_default_categories(session)

    # Get all pending papers
    pending_papers = list(session.exec(
        select(Paper).where(Paper.category_status == CategoryStatus.PENDING_REVIEW)
    ).all())

    if not pending_papers:
        # Still clean up empty categories
        deleted = _delete_empty_categories(session)
        return {"classified": 0, "created_categories": [], "deleted_categories": deleted}

    # Get existing categories for context
    categories = list(session.exec(
        select(Category).where(Category.is_active == True)  # noqa: E712
    ).all())
    category_names = [c.name for c in categories if not c.is_pending_bucket]
    category_map = {c.name: c for c in categories}

    client = DeepSeekClient()
    classified_count = 0
    created_categories: list[str] = []

    # Process in batches of 10
    for i in range(0, len(pending_papers), 10):
        batch = pending_papers[i:i + 10]
        result = _classify_batch(client, batch, category_names)

        for paper_id, suggestion in result.items():
            paper = session.get(Paper, paper_id)
            if paper is None:
                continue

            cat_name = suggestion.get("category", "").strip()
            reason = suggestion.get("reason", "AI 自动分类")

            if not cat_name:
                continue

            # Find or create category
            category = category_map.get(cat_name)
            if category is None:
                # AI suggested a new category — create it
                try:
                    category = create_category(session, cat_name, f"AI 自动创建：{reason}")
                    category_map[cat_name] = category
                    category_names.append(cat_name)
                    created_categories.append(cat_name)
                except ValueError:
                    # Name conflict, try to find by slug
                    from app.services.category_service import slugify_category_name
                    slug = slugify_category_name(cat_name)
                    category = session.exec(
                        select(Category).where(Category.slug == slug)
                    ).first()
                    if category is None:
                        continue

            update_paper_category(
                session, paper, category,
                confidence=suggestion.get("confidence", 0.8),
                status=CategoryStatus.AUTO_CONFIRMED,
                reason=reason,
            )
            classified_count += 1

    # Clean up empty non-system categories
    deleted = _delete_empty_categories(session)

    return {
        "classified": classified_count,
        "created_categories": created_categories,
        "deleted_categories": deleted,
    }


def _classify_batch(
    client: DeepSeekClient,
    papers: list[Paper],
    existing_categories: list[str],
) -> dict[int, dict]:
    """Call AI to classify a batch of papers."""
    papers_info = []
    for p in papers:
        info = {
            "id": p.id,
            "title": p.title,
            "authors": p.authors[:100] if p.authors else "",
            "abstract": p.abstract_raw[:500] if p.abstract_raw else "",
            "tags": json.loads(p.tags_json) if p.tags_json else [],
        }
        papers_info.append(info)

    system_prompt = (
        "你是论文分类助手。根据论文的标题、摘要和标签，为每篇论文选择最合适的分类。\n\n"
        f"现有分类列表：{json.dumps(existing_categories, ensure_ascii=False)}\n\n"
        "规则：\n"
        "1. 优先使用现有分类\n"
        "2. 如果论文明显不属于任何现有分类，可以建议一个新的分类名称（简短中文，4-8字）\n"
        "3. 不要使用'待确认'或'其他'作为分类结果\n"
        "4. 每篇论文必须给出一个分类\n\n"
        "返回 JSON 格式：\n"
        '{"results": [{"paper_id": 123, "category": "分类名", "confidence": 0.85, "reason": "理由"}]}\n'
        "仅返回 JSON，不要包含其他文本。"
    )

    user_content = json.dumps(papers_info, ensure_ascii=False, indent=2)

    try:
        response = client.chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )

        # Parse response
        import re
        json_str = response
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
        if fence_match:
            json_str = fence_match.group(1).strip()
        obj_match = re.search(r"\{[\s\S]*\}", json_str)
        if obj_match:
            json_str = obj_match.group(0)

        parsed = json.loads(json_str)
        results = parsed.get("results", [])

        mapping: dict[int, dict] = {}
        for item in results:
            pid = item.get("paper_id")
            if pid is not None:
                mapping[pid] = {
                    "category": item.get("category", ""),
                    "confidence": float(item.get("confidence", 0.7)),
                    "reason": item.get("reason", "AI 分类"),
                }
        return mapping

    except Exception as exc:
        logger.warning("AI classification batch failed: %s", exc)
        return {}


def _delete_empty_categories(session: Session) -> list[str]:
    """Remove categories that have 0 papers.
    
    - Non-system categories: delete entirely
    - System categories: mark as is_active=False (hidden)
    - Protected: '待确认' (pending bucket) and '其他' are never removed
    """
    from sqlmodel import func

    categories = list(session.exec(
        select(Category).where(
            Category.is_pending_bucket == False,  # noqa: E712
            Category.is_active == True,  # noqa: E712
        )
    ).all())

    # Keep "其他" category even if empty
    protected_slugs = {"其他", "other"}

    removed_names: list[str] = []
    for cat in categories:
        if cat.slug in protected_slugs:
            continue
        # Count papers referencing this category
        count = session.exec(
            select(func.count()).select_from(Paper).where(Paper.primary_category_id == cat.id)
        ).one()
        if count == 0:
            removed_names.append(cat.name)
            if cat.is_system:
                # System categories: just hide them (ensure_default_categories won't re-create active ones)
                cat.is_active = False
                session.add(cat)
            else:
                # Non-system categories: delete entirely
                from app.models.category_alias import CategoryAlias
                aliases = list(session.exec(
                    select(CategoryAlias).where(CategoryAlias.category_id == cat.id)
                ).all())
                for alias in aliases:
                    session.delete(alias)
                session.flush()
                session.delete(cat)
                session.flush()

    if removed_names:
        session.commit()

    return removed_names
