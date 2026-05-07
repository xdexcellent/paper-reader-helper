from typing import Protocol

from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import (
    PaperBlockTranslation,
    PaperBlockTranslationStatus,
)
from app.services.deepseek_client import (
    BLOCK_TRANSLATION_PROMPT_VERSION,
    DeepSeekClient,
)


DEFAULT_BLOCK_TRANSLATION_LANGUAGE = "zh-CN"
DEFAULT_BLOCK_TRANSLATION_MODEL = "gpt-5.4"


class BlockTranslatorClient(Protocol):
    def translate_block_text(
        self,
        *,
        text: str,
        target_language: str,
        model: str,
        page_index: int | None,
        block_type: str,
    ) -> dict[str, str]:
        ...


class BlockTranslationService:
    def __init__(self, client: BlockTranslatorClient | None = None) -> None:
        self.client = client or DeepSeekClient()

    def find_cached_translation(
        self,
        session: Session,
        block: PaperBlock,
        target_language: str = DEFAULT_BLOCK_TRANSLATION_LANGUAGE,
        model: str = DEFAULT_BLOCK_TRANSLATION_MODEL,
    ) -> PaperBlockTranslation | None:
        return session.exec(
            select(PaperBlockTranslation)
            .where(
                PaperBlockTranslation.block_id == block.id,
                PaperBlockTranslation.target_language == target_language,
                PaperBlockTranslation.model_name == model,
                PaperBlockTranslation.prompt_version == BLOCK_TRANSLATION_PROMPT_VERSION,
                PaperBlockTranslation.source_hash == block.source_hash,
                PaperBlockTranslation.status == PaperBlockTranslationStatus.COMPLETED,
            )
            .order_by(PaperBlockTranslation.id.desc())
        ).first()

    def translate_block(
        self,
        session: Session,
        paper: Paper,
        block: PaperBlock,
        *,
        target_language: str = DEFAULT_BLOCK_TRANSLATION_LANGUAGE,
        model: str = DEFAULT_BLOCK_TRANSLATION_MODEL,
        force_refresh: bool = False,
    ) -> PaperBlockTranslation:
        language = target_language.strip() or DEFAULT_BLOCK_TRANSLATION_LANGUAGE
        model_name = model.strip() or DEFAULT_BLOCK_TRANSLATION_MODEL
        if paper.id != block.paper_id:
            raise ValueError("block does not belong to paper")
        if not block.text.strip():
            raise ValueError("block has no translatable text")
        if not force_refresh:
            cached = self.find_cached_translation(session, block, language, model_name)
            if cached is not None:
                return cached

        try:
            payload = self.client.translate_block_text(
                text=block.text,
                target_language=language,
                model=model_name,
                page_index=block.page_index,
                block_type=block.block_type,
            )
        except Exception as exc:
            failed = self._store_failure(session, paper, block, language, model_name, str(exc))
            return failed

        translation = PaperBlockTranslation(
            paper_id=paper.id,
            block_id=block.id,
            target_language=language,
            model_name=payload.get("model_name", model_name),
            prompt_version=payload.get("prompt_version", BLOCK_TRANSLATION_PROMPT_VERSION),
            source_hash=block.source_hash,
            translated_text=payload["translated_text"].strip(),
            status=PaperBlockTranslationStatus.COMPLETED,
            error_message="",
        )
        session.add(translation)
        session.flush()
        return translation

    def _store_failure(
        self,
        session: Session,
        paper: Paper,
        block: PaperBlock,
        target_language: str,
        model: str,
        error_message: str,
    ) -> PaperBlockTranslation:
        failed = PaperBlockTranslation(
            paper_id=paper.id,
            block_id=block.id,
            target_language=target_language,
            model_name=model,
            prompt_version=BLOCK_TRANSLATION_PROMPT_VERSION,
            source_hash=block.source_hash,
            translated_text="",
            status=PaperBlockTranslationStatus.FAILED,
            error_message=error_message,
        )
        session.add(failed)
        session.flush()
        return failed
