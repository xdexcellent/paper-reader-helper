import json

import httpx
from sqlmodel import Session

from app.core.db import engine
from app.models.ai_provider_settings import AiProviderSettings
from app.services import deepseek_client as deepseek_module
from app.services.deepseek_client import DeepSeekClient


def test_stream_chat_uses_llm_config_without_automation_proxy(monkeypatch) -> None:
    captured_kwargs: dict = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def iter_lines(self):
            payload = {
                "choices": [
                    {
                        "delta": {
                            "content": "中文结果",
                        }
                    }
                ]
            }
            return iter([f"data: {json.dumps(payload, ensure_ascii=False)}", "data: [DONE]"])

    class FakeStream:
        def __enter__(self):
            return FakeResponse()

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeClient:
        def stream(self, *args, **kwargs):
            return FakeStream()

        def close(self) -> None:
            return None

    def fake_get_http_client(**kwargs):
        captured_kwargs.update(kwargs)
        return FakeClient()

    monkeypatch.setattr(deepseek_module, "get_http_client", fake_get_http_client)

    client = DeepSeekClient(api_base="https://llm.example.com/v1", api_key="test-key")
    result = client._stream_chat(
        "https://llm.example.com/v1/chat/completions",
        {"model": "gpt-5.4-mini", "messages": [], "stream": True},
    )

    assert result == "中文结果"
    assert isinstance(captured_kwargs["timeout"], httpx.Timeout)
    assert captured_kwargs["timeout"].read == 30.0
    assert captured_kwargs["use_db_proxy"] is False


def test_stream_chat_raises_timeout_when_streaming_exceeds_total_deadline(monkeypatch) -> None:
    """Regression: streaming must not hang indefinitely when provider keeps sending
    chunks without [DONE] or the connection is half-open."""
    monkeypatch.setattr(deepseek_module, "STREAM_TOTAL_TIMEOUT_SECONDS", 0.5)

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def iter_lines(self):
            payload = {"choices": [{"delta": {"content": "chunk"}}]}
            while True:
                yield f"data: {json.dumps(payload, ensure_ascii=False)}"

    class FakeStream:
        def __enter__(self):
            return FakeResponse()

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeClient:
        def stream(self, *args, **kwargs):
            return FakeStream()

        def close(self) -> None:
            return None

    monkeypatch.setattr(deepseek_module, "get_http_client", lambda **kwargs: FakeClient())

    client = DeepSeekClient(api_base="https://llm.example.com/v1", api_key="test-key")
    try:
        client._stream_chat(
            "https://llm.example.com/v1/chat/completions",
            {"model": "gpt-5.4-mini", "messages": [], "stream": True},
        )
        assert False, "Expected TimeoutError"
    except TimeoutError as exc:
        assert "0.5s" in str(exc)


def test_deepseek_client_uses_persisted_ai_provider_settings(client) -> None:
    client.put(
        "/settings/ai-provider",
        json={
            "api_base": "https://llm.example.com/v1",
            "api_key": "sk-provider",
            "default_model": "model-default",
        },
    )

    llm = DeepSeekClient()
    assert llm.resolve_model(None) == "model-default"
    assert llm.api_base == "https://llm.example.com/v1"
    assert llm.api_key == "sk-provider"


def test_deepseek_client_explicit_constructor_overrides_database(client) -> None:
    with Session(engine) as session:
        session.add(AiProviderSettings(api_base="https://db.example.com", api_key="db-key", default_model="db-model"))
        session.commit()

    llm = DeepSeekClient(api_base="https://override.example.com", api_key="override-key")

    assert llm.resolve_model("override-model") == "override-model"
    assert llm.api_base == "https://override.example.com"
    assert llm.api_key == "override-key"
