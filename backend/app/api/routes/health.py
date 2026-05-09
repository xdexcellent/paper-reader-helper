from fastapi import APIRouter

from app.services.embedding_service import _EMBEDDING_AVAILABLE

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Health check endpoint.

    Returns basic status and whether the embedding feature is available.
    In desktop packaged mode, sentence-transformers is excluded to
    reduce bundle size, so embedding_available will be False.
    """
    return {
        "status": "ok",
        "embedding_available": _EMBEDDING_AVAILABLE,
    }
