"""Agent read-only library tools — bounded, no sensitive data exposure."""
import json
import logging
import math
from typing import Any

from sqlmodel import Session, select

from app.models.agent_run import AgentRun
from app.models.category import Category
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import PaperBlockTranslation
from app.models.paper_content import PaperContent
from app.models.paper_embedding import PaperEmbedding
from app.models.paper_summary import PaperSummary
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

MAX_LIST_PAPERS = 50
MAX_BLOCK_TEXT_LENGTH = 200
MAX_SEMANTIC_SEARCH_RESULTS = 10


class AgentToolRegistry:
    """Read-only tools for the library Agent — never writes, never exposes secrets."""

    def __init__(self) -> None:
        pass

    # ── helpers ──────────────────────────────────────────────

    def _truncate_text(self, text: str, max_len: int = MAX_BLOCK_TEXT_LENGTH) -> str:
        if len(text) <= max_len:
            return text
        return text[:max_len] + "…"

    def _ok(self, data: Any, truncated: bool = False) -> dict:
        return {"data": data, "truncated": truncated, "error": None}

    def _err(self, message: str) -> dict:
        return {"data": None, "truncated": False, "error": message}

    # ── tools ────────────────────────────────────────────────

    def list_papers(
        self,
        session: Session,
        scope_type: str = "whole_library",
        scope_config: dict | None = None,
    ) -> dict:
        """Bounded paper listing by scope — title/id/status/year/reading_status/favorite only."""
        try:
            query = select(Paper).order_by(Paper.created_at.desc())
            scope_config = scope_config or {}

            if scope_type == "category" and scope_config.get("category_id"):
                query = query.where(Paper.primary_category_id == scope_config["category_id"])
            elif scope_type == "papers" and scope_config.get("paper_ids"):
                query = query.where(Paper.id.in_(scope_config["paper_ids"]))
            elif scope_type == "reader_paper" and scope_config.get("paper_id"):
                query = query.where(Paper.id == scope_config["paper_id"])

            papers = list(session.exec(query).all())
            total = len(papers)
            truncated = total > MAX_LIST_PAPERS
            papers = papers[:MAX_LIST_PAPERS]

            result = []
            for p in papers:
                result.append({
                    "id": p.id,
                    "title": p.title,
                    "status": p.status,
                    "year": p.year,
                    "reading_status": p.reading_status,
                    "favorite": p.favorite,
                    "venue": p.venue,
                    "parse_status": p.parse_status,
                    "summary_status": p.summary_status,
                })

            indicator = {}
            if truncated:
                indicator["total"] = total
                indicator["shown"] = len(result)
            else:
                indicator["total"] = total

            return self._ok({"papers": result, "indicator": indicator}, truncated=truncated)
        except Exception as exc:
            logger.exception("agent_tool_registry.list_papers failed")
            return self._err(str(exc))

    def get_paper_detail(self, session: Session, paper_id: int) -> dict:
        """Return paper metadata + summary short + category + tags + block counts.
        NO full_markdown, NO local_pdf_path, NO source_json, NO API keys."""
        try:
            paper = session.get(Paper, paper_id)
            if paper is None:
                return self._err(f"论文 id={paper_id} 不存在")

            # Summary
            summary = session.exec(
                select(PaperSummary).where(PaperSummary.paper_id == paper_id)
            ).first()

            # Category
            category_name = None
            if paper.primary_category_id:
                cat = session.get(Category, paper.primary_category_id)
                category_name = cat.name if cat else None

            # Tags
            tags: list[str] = []
            try:
                tags = json.loads(paper.tags_json) if paper.tags_json else []
            except (json.JSONDecodeError, TypeError):
                tags = []

            # Block type counts
            blocks = list(session.exec(
                select(PaperBlock).where(PaperBlock.paper_id == paper_id)
            ).all())
            block_type_counts: dict[str, int] = {}
            total_blocks = len(blocks)
            for b in blocks:
                block_type_counts[b.block_type] = block_type_counts.get(b.block_type, 0) + 1

            # Translations summary
            translations = list(session.exec(
                select(PaperBlockTranslation).where(PaperBlockTranslation.paper_id == paper_id)
            ).all())
            translation_status = {
                "total_source_blocks": total_blocks,
                "translated_blocks": len([t for t in translations if t.status == "completed"]),
                "failed_blocks": len([t for t in translations if t.status == "failed"]),
            }

            detail = {
                "id": paper.id,
                "title": paper.title,
                "source": paper.source,
                "authors": paper.authors,
                "year": paper.year,
                "venue": paper.venue,
                "doi": paper.doi,
                "url": paper.url,
                "favorite": paper.favorite,
                "reading_status": paper.reading_status,
                "reading_progress": paper.reading_progress,
                "user_notes": paper.user_notes,
                "status": paper.status,
                "parse_status": paper.parse_status,
                "summary_status": paper.summary_status,
                "category": category_name,
                "category_confidence": paper.category_confidence,
                "category_status": paper.category_status,
                "tags": tags,
                "one_line_summary": summary.one_line_summary if summary else "",
                "block_stats": {
                    "total_blocks": total_blocks,
                    "by_type": block_type_counts,
                },
                "translation_status": translation_status,
            }
            return self._ok(detail)
        except Exception as exc:
            logger.exception("agent_tool_registry.get_paper_detail failed")
            return self._err(str(exc))

    def list_categories(self, session: Session) -> dict:
        """Return all active categories with paper counts."""
        try:
            categories = list(session.exec(
                select(Category).where(Category.is_active == True).order_by(Category.sort_order, Category.name)  # noqa: E712
            ).all())

            # Count papers per category
            papers = list(session.exec(select(Paper)).all())
            count_map: dict[int, int] = {}
            for p in papers:
                if p.primary_category_id:
                    count_map[p.primary_category_id] = count_map.get(p.primary_category_id, 0) + 1

            result = []
            for cat in categories:
                result.append({
                    "id": cat.id,
                    "name": cat.name,
                    "slug": cat.slug,
                    "description": cat.description,
                    "is_system": cat.is_system,
                    "paper_count": count_map.get(cat.id, 0),
                })
            return self._ok(result)
        except Exception as exc:
            logger.exception("agent_tool_registry.list_categories failed")
            return self._err(str(exc))

    def list_tags(self, session: Session) -> dict:
        """Return distinct tags from all papers."""
        try:
            papers = list(session.exec(select(Paper)).all())
            tag_set: set[str] = set()
            for p in papers:
                try:
                    t = json.loads(p.tags_json)
                    if isinstance(t, list):
                        tag_set.update(tag for tag in t if isinstance(tag, str))
                except (json.JSONDecodeError, TypeError):
                    pass
            return self._ok(sorted(tag_set))
        except Exception as exc:
            logger.exception("agent_tool_registry.list_tags failed")
            return self._err(str(exc))

    def get_paper_blocks(self, session: Session, paper_id: int) -> dict:
        """Return block type/page summary with bounded text snippets; NO source_json."""
        try:
            paper = session.get(Paper, paper_id)
            if paper is None:
                return self._err(f"论文 id={paper_id} 不存在")

            blocks = list(session.exec(
                select(PaperBlock).where(PaperBlock.paper_id == paper_id).order_by(
                    PaperBlock.page_index, PaperBlock.block_index
                )
            ).all())

            block_type_counts: dict[str, int] = {}
            pages: set[int] = set()
            block_summaries = []
            for b in blocks:
                block_type_counts[b.block_type] = block_type_counts.get(b.block_type, 0) + 1
                if b.page_index is not None:
                    pages.add(b.page_index)
                block_summaries.append({
                    "id": b.id,
                    "page_index": b.page_index,
                    "block_index": b.block_index,
                    "block_type": b.block_type,
                    "text_preview": self._truncate_text(b.text),
                    "has_translation": False,  # will be filled below
                })

            # Mark which blocks have completed translations
            translations = list(session.exec(
                select(PaperBlockTranslation).where(
                    PaperBlockTranslation.paper_id == paper_id,
                    PaperBlockTranslation.status == "completed",
                )
            ).all())
            translated_block_ids = {t.block_id for t in translations}
            for bs in block_summaries:
                bs["has_translation"] = bs["id"] in translated_block_ids

            return self._ok({
                "paper_id": paper_id,
                "total_blocks": len(blocks),
                "page_count": len(pages) if pages else 0,
                "block_type_counts": block_type_counts,
                "blocks": block_summaries,
            })
        except Exception as exc:
            logger.exception("agent_tool_registry.get_paper_blocks failed")
            return self._err(str(exc))

    def get_paper_translations(self, session: Session, paper_id: int) -> dict:
        """Return translation status summary per block."""
        try:
            paper = session.get(Paper, paper_id)
            if paper is None:
                return self._err(f"论文 id={paper_id} 不存在")

            translations = list(session.exec(
                select(PaperBlockTranslation).where(
                    PaperBlockTranslation.paper_id == paper_id
                )
            ).all())

            total = len(translations)
            completed = sum(1 for t in translations if t.status == "completed")
            failed = sum(1 for t in translations if t.status == "failed")

            items = []
            for t in translations:
                items.append({
                    "block_id": t.block_id,
                    "target_language": t.target_language,
                    "status": t.status,
                    "model_name": t.model_name,
                    "translated_text_preview": self._truncate_text(t.translated_text, 100) if t.translated_text else "",
                    "error_message": t.error_message if t.status == "failed" else "",
                })

            return self._ok({
                "paper_id": paper_id,
                "total": total,
                "completed": completed,
                "failed": failed,
                "translations": items,
            })
        except Exception as exc:
            logger.exception("agent_tool_registry.get_paper_translations failed")
            return self._err(str(exc))

    def semantic_search(self, session: Session, query: str, top_k: int = 10) -> dict:
        """Semantic vector search across papers, bounded results with similarity scores."""
        try:
            if not query.strip():
                return self._err("查询文本不能为空")

            try:
                query_vec = EmbeddingService.encode(query)
            except Exception as e:
                return self._err(f"Embedding模型不可用: {e}")

            embeddings = list(session.exec(select(PaperEmbedding)).all())
            if not embeddings:
                return self._ok({"results": []})

            def cosine_sim(a: list[float], b: list[float]) -> float:
                dot = sum(x * y for x, y in zip(a, b))
                norm_a = math.sqrt(sum(x * x for x in a))
                norm_b = math.sqrt(sum(x * x for x in b))
                if norm_a == 0 or norm_b == 0:
                    return 0.0
                return dot / (norm_a * norm_b)

            scored: list[tuple[int, str, float]] = []
            for emb in embeddings:
                try:
                    vec = json.loads(emb.embedding_json)
                    sim = cosine_sim(query_vec, vec)
                    paper = session.get(Paper, emb.paper_id)
                    if paper:
                        scored.append((emb.paper_id, paper.title, sim))
                except Exception:
                    continue

            scored.sort(key=lambda x: x[2], reverse=True)
            k = min(top_k, MAX_SEMANTIC_SEARCH_RESULTS)
            top = scored[:k]

            results = []
            for paper_id, title, sim in top:
                results.append({
                    "paper_id": paper_id,
                    "title": title,
                    "similarity": round(sim, 4),
                })

            return self._ok({"results": results})
        except Exception as exc:
            logger.exception("agent_tool_registry.semantic_search failed")
            return self._err(str(exc))
