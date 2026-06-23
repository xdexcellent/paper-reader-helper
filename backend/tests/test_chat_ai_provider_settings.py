from sqlmodel import Session, select

from app.core.db import engine
from app.models.chat_session import ChatSession


def test_chat_session_empty_model_uses_current_system_default(client, mocker) -> None:
    client.put(
        "/settings/ai-provider",
        json={
            "api_base": "https://llm.example.com/v1",
            "api_key": "sk-test",
            "default_model": "model-default",
        },
    )
    captured: dict = {}

    def fake_chat(messages, model=None, thinking=None):
        captured["model"] = model
        return "ok"

    mocker.patch("app.api.routes.chat.DeepSeekClient.chat", side_effect=fake_chat)

    created = client.post("/chat/sessions", json={"title": "系统默认对话"}).json()
    response = client.post(
        f"/chat/sessions/{created['id']}/messages",
        json={"content": "hello", "model": ""},
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "ok"}
    assert captured["model"] is None
    with Session(engine) as session:
        row = session.exec(select(ChatSession).where(ChatSession.id == created["id"])).one()
        assert row.model == ""
