import logging

from sqlmodel import Session, select

from app.models.category import Category
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_embedding import PaperEmbedding
from app.models.paper_summary import PaperSummary
from app.services.block_extraction_service import BlockExtractionService
from app.services.category_classifier import CategoryClassifier
from app.services.category_service import get_pending_category, update_paper_category
from app.services.deepseek_client import DeepSeekClient
from app.services.mineru_client import MineruClient
from app.services.section_extractor import SectionExtractor

logger = logging.getLogger(__name__)


class PaperPipelineService:
    def __init__(
        self,
        mineru_client: MineruClient | None = None,
        deepseek_client: DeepSeekClient | None = None,
        section_extractor: SectionExtractor | None = None,
        category_classifier: CategoryClassifier | None = None,
        block_extraction_service: BlockExtractionService | None = None,
    ) -> None:
        self.mineru_client = mineru_client or MineruClient()
        self.deepseek_client = deepseek_client or DeepSeekClient()
        self.section_extractor = section_extractor or SectionExtractor()
        self.category_classifier = category_classifier or CategoryClassifier(self.deepseek_client)
        self.block_extraction_service = block_extraction_service or BlockExtractionService()

    def parse_paper(self, session: Session, paper: Paper) -> Paper:
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        try:
            result = self.mineru_client.parse_pdf(paper.local_pdf_path)
        except Exception:
            logger.exception("PDF parsing failed for paper %s", paper.id)
            paper.status = "parse_failed"
            paper.parse_status = "failed"
            session.add(paper)
            session.commit()
            session.refresh(paper)
            raise

        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).first()

        if content is None:
            content = PaperContent(paper_id=paper.id)

        content.full_markdown = result["full_markdown"]
        content.abstract_md = ""
        content.introduction_md = ""
        content.method_md = ""
        content.conclusion_md = ""
        content.content_json_path = result["content_json_path"]
        content.full_zip_path = result["full_zip_path"]
        session.add(content)

        summary = session.exec(
            select(PaperSummary).where(PaperSummary.paper_id == paper.id)
        ).first()
        if summary is not None:
            session.delete(summary)

        embedding = session.exec(
            select(PaperEmbedding).where(PaperEmbedding.paper_id == paper.id)
        ).first()
        if embedding is not None:
            session.delete(embedding)

        paper.status = "parsed"
        paper.parse_status = "completed"
        paper.summary_status = "pending"
        paper.embedding_status = "pending"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        try:
            self.block_extraction_service.rebuild_blocks(session, paper, content)
            content.block_extraction_error = ""
            session.add(content)
            session.commit()
        except Exception as e:
            session.rollback()
            logger.warning(
                "Block extraction failed for paper %s; parse remains completed",
                paper.id,
                exc_info=True,
            )
            content.block_extraction_error = f"Block extraction failed: {e}"
            session.add(content)
            session.commit()
        session.refresh(paper)
        return paper

    def summarize_paper(self, session: Session, paper: Paper, model: str = "gpt-5.4") -> Paper:
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).one()

        paper.status = "summarizing"
        paper.summary_status = "processing"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        try:
            sections = self.section_extractor.extract(content.full_markdown)
            content.abstract_md = sections["abstract_md"]
            content.introduction_md = sections["introduction_md"]
            content.method_md = sections["method_md"]
            content.conclusion_md = sections["conclusion_md"]
            session.add(content)

            summary_payload = self.deepseek_client.summarize_sections(sections, model)
        except Exception:
            logger.exception("Summarization failed for paper %s", paper.id)
            paper.status = "summarize_failed"
            paper.summary_status = "failed"
            session.add(paper)
            session.commit()
            session.refresh(paper)
            raise

        summary = session.exec(
            select(PaperSummary).where(PaperSummary.paper_id == paper.id)
        ).first()

        if summary is None:
            summary = PaperSummary(paper_id=paper.id)

        summary.one_line_summary = summary_payload["one_line_summary"]
        summary.core_contributions = summary_payload["core_contributions"]
        summary.method_summary = summary_payload["method_summary"]
        summary.use_cases = summary_payload["use_cases"]
        summary.limitations = summary_payload["limitations"]
        summary.relevance_note = summary_payload["relevance_note"]
        summary.model_name = summary_payload["model_name"]
        summary.prompt_version = summary_payload["prompt_version"]
        session.add(summary)

        paper.summary_status = "completed"
        paper.status = "ready"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        # Keep summarize responsive: embeddings remain manual, tags/categories stay fast.
        try:
            self.auto_tag(session, paper, summary)
        except Exception:
            logger.warning("Auto-tagging failed for paper %s, skipping", paper.id)

        try:
            self.classify_primary_category(session, paper, summary)
        except Exception:
            logger.warning("Primary category classification failed for paper %s, skipping", paper.id)

        return paper

    def generate_embedding(self, session: Session, paper: Paper, content: PaperContent) -> None:
        """Generate and store vector embedding for the paper."""
        import json

        from app.models.paper_embedding import PaperEmbedding
        from app.services.embedding_service import EmbeddingService

        parts = [paper.title]
        if content.abstract_md:
            parts.append(content.abstract_md[:1500])
        if content.method_md:
            parts.append(content.method_md[:1500])
        if content.conclusion_md:
            parts.append(content.conclusion_md[:500])
        text = "\n\n".join(parts)

        paper.embedding_status = "processing"
        session.add(paper)
        session.commit()

        try:
            vector = EmbeddingService.encode(text)
        except Exception as exc:
            from app.services.embedding_service import EmbeddingUnavailableError
            if isinstance(exc, EmbeddingUnavailableError):
                paper.embedding_status = "unavailable"
            else:
                paper.embedding_status = "failed"
            session.add(paper)
            session.commit()
            raise

        existing = session.exec(
            select(PaperEmbedding).where(PaperEmbedding.paper_id == paper.id)
        ).first()
        if existing:
            existing.embedding_json = json.dumps(vector)
            session.add(existing)
        else:
            emb = PaperEmbedding(paper_id=paper.id, embedding_json=json.dumps(vector))
            session.add(emb)

        paper.embedding_status = "completed"
        session.add(paper)
        session.commit()
        session.refresh(paper)
        logger.info("Embedding generated for paper %s (%d dims)", paper.id, len(vector))

    def auto_tag(self, session: Session, paper: Paper, summary: PaperSummary) -> None:
        """Generate auxiliary tags from the controlled category directory."""
        tags = self.category_classifier.suggest_tags(session, paper, summary)
        if not tags or tags == paper.tags:
            return

        paper.tags = tags
        session.add(paper)
        session.commit()
        session.refresh(paper)
        logger.info("Auto-tagged paper %s with controlled tags: %s", paper.id, tags)

    def classify_primary_category(self, session: Session, paper: Paper, summary: PaperSummary) -> None:
        if paper.category_status == "manual_locked":
            logger.info("Skipping automatic classification for manually locked paper %s", paper.id)
            return

        result = self.category_classifier.classify(session, paper, summary)
        category = session.get(Category, result["primary_category_id"])
        if category is None:
            category = get_pending_category(session)
        update_paper_category(
            session,
            paper,
            category,
            confidence=float(result.get("confidence", 0.0)),
            status=str(result.get("status", "pending_review")),
            reason=str(result.get("reason", "")),
        )
        logger.info("Assigned primary category %s to paper %s", category.name, paper.id)
