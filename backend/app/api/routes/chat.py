from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.chat_message import ChatMessageRecord
from app.models.chat_session import ChatSession
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.schemas.chat import ChatMessage, ChatRequest, ChatResponse
from app.services.deepseek_client import DeepSeekClient

router = APIRouter(prefix="/chat", tags=["chat"])


# ─── Legacy quick-chat (no session) ──────────────────────────

@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest, session: Session = Depends(get_session)) -> ChatResponse:
    client = DeepSeekClient()
    system_parts = [
        "你是一个专业的AI学术研究助手。请用专业、简洁的中文回答用户的问题。",
        "回复时可以使用 Markdown 格式（包括表格、列表、加粗、代码块等）来增强可读性。",
    ]
    if request.paper_id:
        paper = session.get(Paper, request.paper_id)
        if paper:
            context_parts = [f"\n当前用户正在讨论的论文是《{paper.title}》。"]
            content = session.exec(
                select(PaperContent).where(PaperContent.paper_id == request.paper_id)
            ).first()
            if content and content.full_markdown:
                md_text = content.full_markdown[:6000]
                context_parts.append(f"以下是该论文的正文内容（截取前6000字）：\n{md_text}")
            elif content:
                if content.abstract_md:
                    context_parts.append(f"摘要：\n{content.abstract_md}")
                if content.introduction_md:
                    context_parts.append(f"引言：\n{content.introduction_md[:2000]}")
                if content.method_md:
                    context_parts.append(f"方法：\n{content.method_md[:2000]}")
            system_parts.append("\n".join(context_parts))

    messages = [{"role": "system", "content": "\n\n".join(system_parts)}]
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    reply = client.chat(messages, model=request.model)
    return ChatResponse(reply=reply)


# ─── Session CRUD ────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    title: str = "新对话"
    paper_id: int | None = None
    model: str | None = None


class SessionResponse(BaseModel):
    id: int
    title: str
    paper_id: int | None
    model: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    created_at: str


class SessionDetailResponse(SessionResponse):
    messages: list[MessageResponse]


class SendMessageRequest(BaseModel):
    content: str
    paper_id: int | None = None
    model: str | None = None
    chat_mode: str | None = None
    answer_style: str | None = None
    output_format: str | None = None
    deep_analysis: bool | None = None
    paper_only: bool | None = None


class SendMessageResponse(BaseModel):
    reply: str


def _session_to_response(s: ChatSession) -> SessionResponse:
    return SessionResponse(
        id=s.id,
        title=s.title,
        paper_id=s.paper_id,
        model=s.model,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
    )


def _message_to_response(m: ChatMessageRecord) -> MessageResponse:
    return MessageResponse(
        id=m.id,
        session_id=m.session_id,
        role=m.role,
        content=m.content,
        created_at=m.created_at.isoformat(),
    )


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(
    req: CreateSessionRequest, db: Session = Depends(get_session)
) -> SessionResponse:
    model = req.model.strip() if req.model else ""
    cs = ChatSession(title=req.title, paper_id=req.paper_id, model=model)
    db.add(cs)
    db.commit()
    db.refresh(cs)
    return _session_to_response(cs)


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(db: Session = Depends(get_session)) -> list[SessionResponse]:
    sessions = db.exec(
        select(ChatSession).order_by(ChatSession.updated_at.desc())
    ).all()
    return [_session_to_response(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_detail(
    session_id: int, db: Session = Depends(get_session)
) -> SessionDetailResponse:
    cs = db.get(ChatSession, session_id)
    if cs is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    messages = db.exec(
        select(ChatMessageRecord)
        .where(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.asc())
    ).all()

    resp = _session_to_response(cs)
    return SessionDetailResponse(
        **resp.model_dump(),
        messages=[_message_to_response(m) for m in messages],
    )


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_session)) -> dict:
    cs = db.get(ChatSession, session_id)
    if cs is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    # Delete all messages first
    messages = db.exec(
        select(ChatMessageRecord).where(ChatMessageRecord.session_id == session_id)
    ).all()
    for m in messages:
        db.delete(m)
    db.flush()

    db.delete(cs)
    db.commit()
    return {"success": True}


@router.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
def send_message(
    session_id: int,
    req: SendMessageRequest,
    db: Session = Depends(get_session),
) -> SendMessageResponse:
    cs = db.get(ChatSession, session_id)
    if cs is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    client = DeepSeekClient()

    # Update session paper and model if provided
    if req.paper_id is not None:
        cs.paper_id = req.paper_id
    if req.paper_id == -1: 
        cs.paper_id = None
        
    if req.model is not None:
        cs.model = req.model.strip()

    # Save user message
    user_msg = ChatMessageRecord(
        session_id=session_id, role="user", content=req.content
    )
    db.add(user_msg)
    db.flush()

    # Update session title from first user message
    existing_user_msgs = db.exec(
        select(ChatMessageRecord).where(
            ChatMessageRecord.session_id == session_id,
            ChatMessageRecord.role == "user",
        )
    ).all()
    if len(existing_user_msgs) <= 1:
        cs.title = req.content[:25] + ("…" if len(req.content) > 25 else "")

    # Build context for AI
    system_parts = [
        "你是一个专业的AI学术研究助手。请用专业、简洁的中文回答用户的问题。",
        "回复时可以使用 Markdown 格式来增强可读性。",
    ]

    # Apply structured conversation settings as system prompt directives
    if req.chat_mode:
        mode_hints = {
            "论文解读": "请侧重论文的整体解读，覆盖问题、方法、实验和结论。",
            "方法分析": "请侧重分析技术路线、关键模块和实验设计的细节。",
            "实验总结": "请侧重梳理实验设置、数据集、基线对比和结果分析。",
            "创新点": "请侧重提炼核心创新和与已有工作的差异。",
            "局限性": "请侧重批判性分析局限、不足和改进方向。",
            "中文通俗解释": "请用通俗易懂的中文解释，避免堆砌术语，适合非专业读者理解。",
        }
        hint = mode_hints.get(req.chat_mode)
        if hint:
            system_parts.append(hint)

    if req.answer_style:
        style_hints = {
            "学术": "回答风格保持学术严谨，使用规范术语和引用格式。",
            "简洁": "回答风格力求简洁直接，要点突出，避免冗余铺陈。",
            "审稿式": "回答风格模拟审稿人视角，关注贡献声明、实验充分性和逻辑自洽。",
        }
        hint = style_hints.get(req.answer_style)
        if hint:
            system_parts.append(hint)

    if req.output_format:
        format_hints = {
            "卡片": "输出格式使用结构化卡片，每个要点独立成块并加粗标题。",
            "列表": "输出格式使用有序/无序列表，层次分明。",
            "段落": "输出格式使用连贯段落，保持逻辑衔接。",
        }
        hint = format_hints.get(req.output_format)
        if hint:
            system_parts.append(hint)

    if req.deep_analysis is not None:
        if req.deep_analysis:
            system_parts.append("请进行深度分析，提供充分论据、对比和推理，不要敷衍。")
        else:
            system_parts.append("请提供常规层面的回答，无需过度展开。")

    if req.paper_only is not None and req.paper_only and cs.paper_id:
        system_parts.append("仅基于当前关联论文和已关联上下文回答，不足之处请明确说明，不要引入外部猜测。")
    elif req.paper_only is not None and not req.paper_only:
        system_parts.append("可结合论文库与通用学术知识回答，但需区分论文内事实与外部知识。")

    if cs.paper_id:
        paper = db.get(Paper, cs.paper_id)
        if paper:
            context_parts = [f"\n当前用户正在讨论的论文是《{paper.title}》。"]
            content = db.exec(
                select(PaperContent).where(PaperContent.paper_id == cs.paper_id)
            ).first()
            if content and content.full_markdown:
                context_parts.append(f"论文正文（前6000字）：\n{content.full_markdown[:6000]}")
            system_parts.append("\n".join(context_parts))

    # Get all messages in session for context
    all_msgs = db.exec(
        select(ChatMessageRecord)
        .where(ChatMessageRecord.session_id == session_id)
        .order_by(ChatMessageRecord.created_at.asc())
    ).all()

    messages = [{"role": "system", "content": "\n\n".join(system_parts)}]
    for m in all_msgs:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "content": m.content})

    # Call AI
    reply_text = client.chat(messages, model=cs.model or None)

    # Save AI reply
    ai_msg = ChatMessageRecord(
        session_id=session_id, role="assistant", content=reply_text
    )
    db.add(ai_msg)

    # Update session timestamp
    cs.updated_at = datetime.now(timezone.utc)
    db.add(cs)
    db.commit()

    return SendMessageResponse(reply=reply_text)
