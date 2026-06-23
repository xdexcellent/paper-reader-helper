import json
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlmodel import Session

from app.core.config import settings
from app.models.ai_provider_settings import AiProviderSettings
from app.services.http_client_factory import get_http_client


DEFAULT_AI_PROVIDER_NAME = "OpenAI Compatible"
DEFAULT_AI_MODEL = "gpt-5.4"
MASKED_API_KEY_SENTINELS = {"", "••••••••", "********"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _decode_models(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _encode_models(models: list[str] | None) -> str:
    cleaned: list[str] = []
    seen: set[str] = set()
    for model in models or []:
        value = str(model).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    return json.dumps(cleaned, ensure_ascii=False)


def _mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "••••"
    return f"{api_key[:4]}••••{api_key[-4:]}"


def _is_masked_api_key_value(api_key: str) -> bool:
    return api_key in MASKED_API_KEY_SENTINELS or "••••" in api_key or "****" in api_key


def _resolve_models_endpoint(api_base: str) -> str:
    base = api_base.rstrip("/")
    if base.endswith("/models"):
        return base
    if base.endswith("/v1"):
        return f"{base}/models"
    return f"{base}/v1/models"


@dataclass(frozen=True)
class EffectiveAiProviderSettings:
    provider_name: str
    api_base: str
    api_key: str
    default_model: str
    available_models: list[str]


class AiProviderSettingsService:
    SINGLETON_ID = 1

    @classmethod
    def get_settings(cls, session: Session) -> AiProviderSettings:
        row = session.get(AiProviderSettings, cls.SINGLETON_ID)
        if row is not None:
            return row

        row = AiProviderSettings(
            id=cls.SINGLETON_ID,
            provider_name=DEFAULT_AI_PROVIDER_NAME,
            api_base=settings.deepseek_api_base,
            default_model=DEFAULT_AI_MODEL,
            available_models_json=_encode_models([DEFAULT_AI_MODEL]),
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @classmethod
    def get_effective_settings(cls, session: Session) -> EffectiveAiProviderSettings:
        row = cls.get_settings(session)
        default_model = (row.default_model or DEFAULT_AI_MODEL).strip()
        models = _decode_models(row.available_models_json)
        if default_model and default_model not in models:
            models = [default_model, *models]
        return EffectiveAiProviderSettings(
            provider_name=(row.provider_name or DEFAULT_AI_PROVIDER_NAME).strip(),
            api_base=(row.api_base or settings.deepseek_api_base).strip(),
            api_key=(row.api_key or settings.deepseek_api_key).strip(),
            default_model=default_model,
            available_models=models,
        )

    @classmethod
    def to_response(cls, session: Session) -> dict:
        row = cls.get_settings(session)
        effective = cls.get_effective_settings(session)
        effective_key = effective.api_key
        return {
            "provider_name": effective.provider_name,
            "api_base": effective.api_base,
            "api_key_set": bool(effective_key),
            "api_key_preview": _mask_api_key(effective_key),
            "default_model": effective.default_model,
            "available_models": effective.available_models,
        }

    @classmethod
    def update_settings(cls, session: Session, updates: dict) -> AiProviderSettings:
        row = cls.get_settings(session)

        if "provider_name" in updates and updates["provider_name"]:
            row.provider_name = updates["provider_name"]
        if "api_base" in updates and updates["api_base"] is not None:
            row.api_base = updates["api_base"]
        if "default_model" in updates and updates["default_model"] is not None:
            row.default_model = updates["default_model"] or DEFAULT_AI_MODEL
        if "available_models" in updates and updates["available_models"] is not None:
            row.available_models_json = _encode_models(updates["available_models"])

        api_key = updates.get("api_key")
        if api_key is not None and not _is_masked_api_key_value(api_key):
            row.api_key = api_key

        models = _decode_models(row.available_models_json)
        if row.default_model and row.default_model not in models:
            row.available_models_json = _encode_models([row.default_model, *models])

        row.updated_at = _utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return row

    @classmethod
    def fetch_models(
        cls,
        session: Session,
        *,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> list[str]:
        effective = cls.get_effective_settings(session)
        resolved_base = (api_base or effective.api_base).strip()
        resolved_key = (api_key or effective.api_key).strip()
        if not resolved_base:
            raise ValueError("AI 供应商 URL 未配置")
        if not resolved_key:
            raise ValueError("AI 供应商 API Key 未配置")

        endpoint = _resolve_models_endpoint(resolved_base)
        client = get_http_client(timeout=30, use_db_proxy=False)
        try:
            response = client.get(
                endpoint,
                headers={"Authorization": f"Bearer {resolved_key}"},
            )
            response.raise_for_status()
            payload = response.json()
        finally:
            client.close()

        raw_models = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(raw_models, list):
            raise ValueError("模型列表响应格式不正确")

        models: list[str] = []
        seen: set[str] = set()
        for item in raw_models:
            model_id = item.get("id") if isinstance(item, dict) else item
            value = str(model_id).strip() if model_id is not None else ""
            if not value or value in seen:
                continue
            seen.add(value)
            models.append(value)
        if not models:
            raise ValueError("供应商未返回可用模型")
        return models
