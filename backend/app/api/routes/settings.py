from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.schemas.settings import (
    AiProviderModelsRequest,
    AiProviderModelsResponse,
    AiProviderSettingsResponse,
    AiProviderSettingsUpdate,
)
from app.services.ai_provider_settings_service import AiProviderSettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/ai-provider", response_model=AiProviderSettingsResponse)
def get_ai_provider_settings(
    db: Session = Depends(get_session),
) -> AiProviderSettingsResponse:
    return AiProviderSettingsResponse(**AiProviderSettingsService.to_response(db))


@router.put("/ai-provider", response_model=AiProviderSettingsResponse)
def update_ai_provider_settings(
    payload: AiProviderSettingsUpdate,
    db: Session = Depends(get_session),
) -> AiProviderSettingsResponse:
    AiProviderSettingsService.update_settings(db, payload.model_dump(exclude_unset=True))
    return AiProviderSettingsResponse(**AiProviderSettingsService.to_response(db))


@router.post("/ai-provider/models", response_model=AiProviderModelsResponse)
def fetch_ai_provider_models(
    payload: AiProviderModelsRequest,
    db: Session = Depends(get_session),
) -> AiProviderModelsResponse:
    try:
        models = AiProviderSettingsService.fetch_models(
            db,
            api_base=payload.api_base,
            api_key=payload.api_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"获取模型失败：{exc}") from exc
    return AiProviderModelsResponse(models=models)
