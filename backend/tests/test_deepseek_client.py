import json

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
    assert captured_kwargs["timeout"] == 180
    assert captured_kwargs["use_db_proxy"] is False
