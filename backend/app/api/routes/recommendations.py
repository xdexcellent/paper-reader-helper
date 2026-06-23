"""AI-powered paper recommendations."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
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
# Daily cache: keyed by (today, paper-hash, model). Persists across requests within
# the same day unless papers change OR user forces refresh.
_recommendation_cache: dict[tuple[date, tuple, str], list["RecommendationItem"]] = {}


class RecommendationItem(BaseModel):
    paper: PaperResponse
    score: float
    reason: str
    tag: str = ""
    priority_icon: str = "fileText"
    future_direction: str = ""
    category: str = "read_now"
    category_label: str = "优先阅读"
    status_label: str = ""
    action_label: str = "打开论文"
    action_hint: str = ""
    confidence: int = 0
    signals: list[str] = Field(default_factory=list)
    score_breakdown: list[str] = Field(default_factory=list)


@router.get("", response_model=list[RecommendationItem])
def get_recommendations(
    db: Session = Depends(get_session),
    force: bool = Query(default=False, description="跳过缓存，强制重新生成"),
    model: str | None = Query(default=None, description="生成推荐理由使用的模型"),
) -> list[RecommendationItem]:
    papers = list(db.exec(select(Paper)).all())
    if not papers:
        return []
    paper_hash = tuple(
        (
            p.id,
            p.title,
            p.source,
            p.authors,
            p.venue,
            p.year,
            tuple(p.tags),
            p.status,
            p.parse_status,
            p.summary_status,
            p.embedding_status,
            p.category_status,
            p.updated_at.isoformat(),
        )
        for p in papers
    )
    effective_model = DeepSeekClient().resolve_model(model)
    cache_key = (date.today(), paper_hash, effective_model)
    if not force and cache_key in _recommendation_cache:
        return _recommendation_cache[cache_key]
    # Drop stale entries from prior days to avoid unbounded growth.
    today = date.today()
    for stale_key in [k for k in _recommendation_cache if k[0] != today]:
        _recommendation_cache.pop(stale_key, None)

    # Multi-signal scoring. Keep it deterministic so the page remains useful
    # even when the LLM recommendation reason is unavailable.
    scored: list[tuple[Paper, float, list[str], list[str]]] = []
    for p in papers:
        score = 0.0
        signals: list[str] = []
        breakdown: list[str] = []

        if p.status == "ready":
            score += 100
            signals.append("可立即阅读")
            breakdown.append("状态已就绪 +100")
        elif p.status == "parsed":
            score += 80
            signals.append("已完成解析")
            breakdown.append("已解析 +80")
        elif p.status == "summarizing":
            score += 60
            signals.append("摘要生成中")
            breakdown.append("摘要生成中 +60")
        elif p.status == "parsing":
            score += 40
            signals.append("解析进行中")
            breakdown.append("解析进行中 +40")
        elif p.status in {"parse_failed", "summarize_failed"}:
            score += 35
            signals.append("需要修复")
            breakdown.append("失败待处理 +35")
        else:
            score += 20
            signals.append("等待处理")
            breakdown.append("基础候选 +20")

        if p.summary_status == "completed":
            score += 30
            signals.append("已有中文摘要")
            breakdown.append("摘要完成 +30")
        elif p.summary_status == "processing":
            score += 10
            signals.append("摘要处理中")
            breakdown.append("摘要处理中 +10")

        if p.parse_status == "completed" and p.summary_status == "pending":
            score += 50
            signals.append("适合补摘要")
            breakdown.append("解析完成待摘要 +50")

        if p.category_status == "manual_locked":
            score += 18
            signals.append("人工确认分类")
            breakdown.append("人工确认分类 +18")
        elif p.category_confidence >= 0.85:
            score += 12
            signals.append("分类置信度高")
            breakdown.append("分类置信度高 +12")

        tags = p.tags
        if tags:
            tag_preview = "、".join(tags[:2])
            signals.append(f"标签：{tag_preview}")
            score += min(len(tags), 3) * 4
            breakdown.append(f"已有标签 +{min(len(tags), 3) * 4}")

        scored.append((p, score, signals, breakdown))

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
                for i, (p, score, signals, breakdown) in enumerate(scored):
                    if p.id != anchor.id and p.id in emb_map:
                        sim = cosine_sim(anchor_vec, emb_map[p.id])
                        if sim > 0.7:  # High similarity threshold
                            # Boost significantly based on similarity
                            bonus = round(sim * 150, 1)
                            scored[i] = (
                                p,
                                score + bonus,
                                [*signals, f"与高优先级论文相似 {sim:.0%}"],
                                [*breakdown, f"语义相似 +{bonus}"],
                            )
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
        for p, s, _signals, _breakdown in top:
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
            + "- \"priority_icon\": 使用一个图标键名，限定为 target/fileText/spark/vector/warning。\n"
            + "- \"future_direction\": 约30字的可行未来研究方向扩展。\n"
            + "\n请严格且仅输出这一个合法的JSON数组，无需额外说明格式及内容符号。"
        )
        reply = client.chat(
            [{"role": "user", "content": prompt}],
            model=effective_model,
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

    for i, (p, s, signals, breakdown) in enumerate(top):
        ai_data = ai_dict.get(p.id, {})
        reason = ai_data.get("reason")
        tag = ai_data.get("tag", "") or _fallback_tag(p)
        priority_icon = ai_data.get("priority_icon", "") or _priority_icon_for_paper(p)
        future_direction = ai_data.get("future_direction", "")

        # Fallback reason
        if not reason:
            reason = _fallback_reason(p)
        if not future_direction:
            future_direction = _fallback_future_direction(p)

        category, category_label = _recommendation_category(p)

        results.append(RecommendationItem(
            paper=PaperResponse.model_validate(p),
            score=s,
            reason=reason,
            tag=tag,
            priority_icon=priority_icon,
            future_direction=future_direction,
            category=category,
            category_label=category_label,
            status_label=_status_label(p),
            action_label=_action_label(p),
            action_hint=_action_hint(p),
            confidence=_confidence_from_score(s),
            signals=signals[:6],
            score_breakdown=breakdown[:7],
        ))

    _recommendation_cache[cache_key] = results
    return results


def _status_label(paper: Paper) -> str:
    if paper.status == "ready":
        return "已就绪"
    if paper.status == "parsed":
        return "已解析"
    if paper.status == "summarizing":
        return "摘要中"
    if paper.status == "parsing":
        return "解析中"
    if paper.status == "parse_failed":
        return "解析失败"
    if paper.status == "summarize_failed":
        return "摘要失败"
    return "待处理"


def _recommendation_category(paper: Paper) -> tuple[str, str]:
    if paper.status == "ready" and paper.summary_status == "completed":
        return "read_now", "优先阅读"
    if paper.parse_status == "completed" and paper.summary_status in {"pending", "failed"}:
        return "summarize_next", "补充摘要"
    if paper.status in {"parse_failed", "summarize_failed"} or paper.parse_status == "failed":
        return "recover", "修复处理"
    return "process_next", "推进处理"


def _action_label(paper: Paper) -> str:
    category, _label = _recommendation_category(paper)
    if category == "read_now":
        return "开始阅读"
    if category == "summarize_next":
        return "生成摘要"
    if category == "recover":
        return "查看并重试"
    return "打开处理"


def _action_hint(paper: Paper) -> str:
    category, _label = _recommendation_category(paper)
    if category == "read_now":
        return "已有解析和摘要，适合作为当前阅读入口。"
    if category == "summarize_next":
        return "正文已解析完成，补齐摘要后可进入高质量阅读。"
    if category == "recover":
        return "当前卡在失败状态，建议先进入详情页重试对应流程。"
    return "仍在队列或处理中，进入详情页可查看当前进度。"


def _fallback_reason(paper: Paper) -> str:
    category, _label = _recommendation_category(paper)
    if category == "read_now":
        if paper.tags:
            return f"已完成摘要，且带有“{'、'.join(paper.tags[:2])}”标签，适合优先阅读。"
        return "已完成解析和摘要，信息完整度高，适合作为当前阅读对象。"
    if category == "summarize_next":
        return "正文已解析但缺少中文摘要，补齐后能显著提升后续筛选效率。"
    if category == "recover":
        return "处理流程失败但仍保留候选信息，建议优先修复以免遗漏重要论文。"
    return "论文已进入工作流，当前适合作为后续处理队列中的候选。"


def _fallback_future_direction(paper: Paper) -> str:
    if paper.tags:
        return f"可围绕“{'、'.join(paper.tags[:2])}”继续检索相邻主题论文。"
    category, _label = _recommendation_category(paper)
    if category == "read_now":
        return "阅读后可补充标签或主分类，让后续推荐更贴近你的研究方向。"
    if category == "summarize_next":
        return "生成摘要后再与已读论文做语义检索，判断是否值得深读。"
    if category == "recover":
        return "先完成修复，再纳入每日速览或语义推荐链路。"
    return "完成解析和摘要后，推荐质量会继续提升。"


def _fallback_tag(paper: Paper) -> str:
    if paper.tags:
        return paper.tags[0]
    if paper.source:
        return paper.source
    return _recommendation_category(paper)[1]


def _priority_icon_for_paper(paper: Paper) -> str:
    category, _label = _recommendation_category(paper)
    return {
        "read_now": "target",
        "summarize_next": "spark",
        "recover": "warning",
        "process_next": "fileText",
    }.get(category, "fileText")


def _confidence_from_score(score: float) -> int:
    if score >= 180:
        return 96
    if score >= 140:
        return 88
    if score >= 100:
        return 76
    if score >= 70:
        return 62
    return 48
