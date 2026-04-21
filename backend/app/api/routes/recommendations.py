"""AI-powered paper recommendations."""

import logging
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

import json

from app.core.db import get_session
from app.models.paper import Paper
from app.models.paper_summary import PaperSummary
from app.models.paper_content import PaperContent
from app.schemas.paper import PaperResponse
from app.services.deepseek_client import DeepSeekClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
_CACHE_TTL_SECONDS = 60
_recommendation_cache: tuple[tuple, float, list["RecommendationItem"]] | None = None


class RecommendationItem(BaseModel):
    paper: PaperResponse
    score: float
    reason: str
    tag: str = ""
    priority_icon: str = "📄"
    future_direction: str = ""


@router.get("", response_model=list[RecommendationItem])
def get_recommendations(
    db: Session = Depends(get_session),
) -> list[RecommendationItem]:
    global _recommendation_cache
    papers = list(db.exec(select(Paper)).all())
    if not papers:
        return []
    cache_key = tuple(
        (p.id, p.status, p.parse_status, p.summary_status, p.updated_at.isoformat())
        for p in papers
    )
    if (
        _recommendation_cache is not None
        and _recommendation_cache[0] == cache_key
        and time.monotonic() - _recommendation_cache[1] < _CACHE_TTL_SECONDS
    ):
        return _recommendation_cache[2]

    # Basic Status Scoring
    scored: list[tuple[Paper, float]] = []
    for p in papers:
        score = 0.0
        # Ready papers are highest priority
        if p.status == "ready":
            score += 100
        elif p.status == "parsed":
            score += 80
        elif p.status == "summarizing":
            score += 60
        elif p.status == "parsing":
            score += 40
        else:
            score += 20

        # Has summary → more complete
        if p.summary_status == "completed":
            score += 30
        elif p.summary_status == "processing":
            score += 10

        # Parsed but no summary → actionable
        if p.parse_status == "completed" and p.summary_status == "pending":
            score += 50

        scored.append((p, score))

    # Add Embedding Similarity Bonus
    from app.models.paper_embedding import PaperEmbedding
    import math

    # Find a good "anchor" paper (e.g. recently parsed/ready)
    anchor = max(scored, key=lambda x: x[1])[0] if scored else None
    
    if anchor:
        anchor_emb_record = db.exec(
            select(PaperEmbedding).where(PaperEmbedding.paper_id == anchor.id)
        ).first()
        
        if anchor_emb_record:
            import json as _json
            try:
                anchor_vec = _json.loads(anchor_emb_record.embedding_json)
                
                # Load all embeddings to calculate similarity bonus
                all_embs = list(db.exec(select(PaperEmbedding)).all())
                emb_map = {}
                for e in all_embs:
                    try:
                        emb_map[e.paper_id] = _json.loads(e.embedding_json)
                    except Exception:
                        pass
                
                def cosine_sim(a: list[float], b: list[float]) -> float:
                    dot = sum(x * y for x, y in zip(a, b))
                    norm_a = math.sqrt(sum(x * x for x in a))
                    norm_b = math.sqrt(sum(x * x for x in b))
                    if norm_a == 0 or norm_b == 0:
                        return 0.0
                    return dot / (norm_a * norm_b)
                
                # Apply Semantic Bonus to other papers
                for i, (p, score) in enumerate(scored):
                    if p.id != anchor.id and p.id in emb_map:
                        sim = cosine_sim(anchor_vec, emb_map[p.id])
                        if sim > 0.7:  # High similarity threshold
                            # Boost significantly based on similarity
                            scored[i] = (p, score + (sim * 150))
            except Exception:
                logger.warning("Failed to apply embedding bonus in recommendations", exc_info=True)

    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:6]

    # Try to generate AI reasons for recommendations
    results: list[RecommendationItem] = []
    ai_dict = {}
    try:
        client = DeepSeekClient()
        titles_info = []
        for p, s in top:
            summary = db.exec(
                select(PaperSummary).where(PaperSummary.paper_id == p.id)
            ).first()
            content = db.exec(
                select(PaperContent).where(PaperContent.paper_id == p.id)
            ).first()
            
            info = f"《{p.title}》(ID:{p.id})"
            has_details = False
            if content:
                if content.abstract_md:
                    info += f"\n摘要片段: {content.abstract_md[:300]}"
                    has_details = True
                if content.method_md:
                    info += f"\n方法片段: {content.method_md[:300]}"
                    has_details = True
            
            if not has_details and summary and summary.one_line_summary:
                info += f"\n简述: {summary.one_line_summary}"
                
            titles_info.append(info)

        prompt = (
            "以下是用户文献库中推荐阅读的论文片段信息。\n"
            + "\n".join(f"[{i+1}] {t}" for i, t in enumerate(titles_info))
            + "\n\n请深度分析上述每篇论文的摘要与方法，返回一个合法的 JSON 数组格式（[{...}]）。\n"
            + "对于每篇论文，JSON 对象必须包含且仅包含以下字段：\n"
            + "- \"id\": 对应上面论文的内部 ID (int类型)。\n"
            + "- \"reason\": 约30字的推荐理由，需综合评价其方法与价值。\n"
            + "- \"tag\": 论文的核心技术词汇（5-15个字符，如 'Diffusion', 'RLHF'）。\n"
            + "- \"priority_icon\": 挑选一个最符合学术属性的1个Emoji图标（如 💡, 🔥, 🚀, 🧠, ⚡️ 等）。\n"
            + "- \"future_direction\": 约30字的可行未来研究方向扩展。\n"
            + "\n请严格且仅输出这一个合法的JSON数组，无需额外说明格式及内容符号。"
        )
        reply = client.chat(
            [{"role": "user", "content": prompt}],
            model="gpt-5.4-mini",
        )
        
        # Clean potential markdown fences from JSON reply
        clean_reply = reply.strip()
        if clean_reply.startswith("```"):
            lines = clean_reply.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            clean_reply = "\n".join(lines).strip()
            
        start = clean_reply.find('[')
        end = clean_reply.rfind(']') + 1
        if start != -1 and end != 0:
            parsed = json.loads(clean_reply[start:end])
            if isinstance(parsed, list):
                ai_dict = {item.get("id"): item for item in parsed if isinstance(item, dict)}
    except Exception:
        logger.warning("Failed to generate AI recommendation reasons", exc_info=True)

    for i, (p, s) in enumerate(top):
        ai_data = ai_dict.get(p.id, {})
        reason = ai_data.get("reason")
        tag = ai_data.get("tag", "")
        priority_icon = ai_data.get("priority_icon", "📄")
        future_direction = ai_data.get("future_direction", "")

        # Fallback reason
        if not reason:
            if p.status == "ready":
                reason = "已就绪，建议阅读"
            elif p.parse_status == "completed" and p.summary_status == "pending":
                reason = "已解析，建议生成摘要"
            elif p.status == "parsed":
                reason = "已解析，可查看内容"
            else:
                reason = "待处理"

        results.append(RecommendationItem(
            paper=PaperResponse.model_validate(p),
            score=s,
            reason=reason,
            tag=tag,
            priority_icon=priority_icon,
            future_direction=future_direction
        ))

    _recommendation_cache = (cache_key, time.monotonic(), results)
    return results
