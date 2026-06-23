import json

from sqlmodel import Session

from app.core.db import engine
from app.models.ai_provider_settings import AiProviderSettings


def test_get_ai_provider_settings_bootstraps_masked_response(client) -> None:
    response = client.get("/settings/ai-provider")

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider_name"] == "OpenAI Compatible"
    assert payload["api_base"]
    assert isinstance(payload["api_key_set"], bool)
    assert isinstance(payload["api_key_preview"], str)
    assert payload["default_model"] == "gpt-5.4"
    assert "api_key" not in payload


def test_put_ai_provider_settings_persists_secret_and_masks_response(client) -> None:
    response = client.put(
        "/settings/ai-provider",
        json={
            "provider_name": "Custom Provider",
            "api_base": "https://llm.example.com/v1",
            "api_key": "sk-secret-123456",
            "default_model": "custom-model",
            "available_models": ["custom-model", "backup-model"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider_name"] == "Custom Provider"
    assert payload["api_base"] == "https://llm.example.com/v1"
    assert payload["api_key_set"] is True
    assert payload["api_key_preview"] == "sk-s••••3456"
    assert payload["default_model"] == "custom-model"
    assert payload["available_models"] == ["custom-model", "backup-model"]
    assert "api_key" not in payload

    with Session(engine) as session:
        row = session.get(AiProviderSettings, 1)
        assert row is not None
        assert row.api_key == "sk-secret-123456"


def test_put_ai_provider_settings_keeps_existing_secret_for_masked_or_blank_key(client) -> None:
    client.put(
        "/settings/ai-provider",
        json={
            "api_base": "https://llm.example.com",
            "api_key": "sk-keep-me",
            "default_model": "model-a",
        },
    )

    response = client.put(
        "/settings/ai-provider",
        json={
            "api_base": "https://llm.example.com",
            "api_key": "",
            "default_model": "model-b",
        },
    )

    assert response.status_code == 200
    with Session(engine) as session:
        row = session.get(AiProviderSettings, 1)
        assert row is not None
        assert row.api_key == "sk-keep-me"
        assert row.default_model == "model-b"

    response = client.put(
        "/settings/ai-provider",
        json={
            "api_base": "https://llm.example.com",
            "api_key": "sk-k••••p-me",
            "default_model": "model-c",
        },
    )

    assert response.status_code == 200
    with Session(engine) as session:
        row = session.get(AiProviderSettings, 1)
        assert row is not None
        assert row.api_key == "sk-keep-me"
        assert row.default_model == "model-c"


def test_fetch_ai_provider_models_uses_openai_compatible_models_endpoint(client, monkeypatch) -> None:
    captured = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"data": [{"id": "model-a"}, {"id": "model-b"}]}

    class FakeClient:
        def get(self, url, headers):
            captured["url"] = url
            captured["headers"] = headers
            return FakeResponse()

        def close(self) -> None:
            captured["closed"] = True

    monkeypatch.setattr(
        "app.services.ai_provider_settings_service.get_http_client",
        lambda **kwargs: FakeClient(),
    )

    response = client.post(
        "/settings/ai-provider/models",
        json={"api_base": "https://llm.example.com/v1", "api_key": "sk-test"},
    )

    assert response.status_code == 200
    assert response.json() == {"models": ["model-a", "model-b"]}
    assert captured["url"] == "https://llm.example.com/v1/models"
    assert captured["headers"] == {"Authorization": "Bearer sk-test"}
    assert captured["closed"] is True


def test_fetch_ai_provider_models_persists_deduped_models_when_saved(client) -> None:
    client.put(
        "/settings/ai-provider",
        json={
            "default_model": "model-a",
            "available_models": ["model-a", "model-a", "model-b"],
        },
    )

    with Session(engine) as session:
        row = session.get(AiProviderSettings, 1)
        assert row is not None
        assert json.loads(row.available_models_json) == ["model-a", "model-b"]
