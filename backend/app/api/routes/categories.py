from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.schemas.category import CategoryCreateRequest, CategoryResponse
from app.services.category_service import create_category, ensure_default_categories, list_categories_with_counts

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
