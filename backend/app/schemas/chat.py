from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    paper_id: int | None = None
    model: str | None = None


class ChatResponse(BaseModel):
    reply: str
