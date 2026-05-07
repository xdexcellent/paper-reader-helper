import pytest
from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import (
    PaperBlockTranslation,
    PaperBlockTranslationStatus,
)
from app.services.block_translation_service import (
    BLOCK_TRANSLATION_PROMPT_VERSION,
    BlockTranslationService,
)
from app.services.deepseek_client import DeepSeekClient


class FakeTranslationClient:
    def __init__(self, translated_text: str = "Translated block") -> None:
        self.translated_text = translated_text
        self.calls: list[dict] = []

    def translate_block_text(self, **kwargs) -> dict[str, str]:
        self.calls.append(kwargs)
        return {
            "translated_text": self.translated_text,
            "model_name": kwargs["model"],
            "prompt_version": BLOCK_TRANSLATION_PROMPT_VERSION,
        }


class FailingTranslationClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def translate_block_text(self, **kwargs) -> dict[str, str]:
        self.calls.append(kwargs)
        raise RuntimeError("model unavailable")


def _create_paper_and_block(
    session: Session,
    *,
    text: str = "Important English block",
    source_hash: str = "hash-current",
) -> tuple[Paper, PaperBlock]:
    paper = Paper(source="manual", title="Translation Paper", local_pdf_path="/tmp/a.pdf")
    session.add(paper)
    session.commit()
    session.refresh(paper)
    block = PaperBlock(
        paper_id=paper.id,
        page_index=0,
        block_index=0,
        block_type="text",
        text=text,
        source_hash=source_hash,
    )
    session.add(block)
    session.commit()
    session.refresh(block)
    return paper, block


def _add_completed_translation(
    session: Session,
    paper: Paper,
    block: PaperBlock,
    *,
    source_hash: str,
    translated_text: str = "Cached translation",
) -> PaperBlockTranslation:
    translation = PaperBlockTranslation(
        paper_id=paper.id,
        block_id=block.id,
        target_language="zh-CN",
        model_name="gpt-5.4",
        prompt_version=BLOCK_TRANSLATION_PROMPT_VERSION,
        source_hash=source_hash,
        translated_text=translated_text,
        status=PaperBlockTranslationStatus.COMPLETED,
    )
    session.add(translation)
    session.commit()
    session.refresh(translation)
    return translation


def test_translate_block_returns_cache_hit_without_model_call(client) -> None:
    fake_client = FakeTranslationClient()
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session)
        cached = _add_completed_translation(
            session, paper, block, source_hash=block.source_hash
        )

        result = BlockTranslationService(fake_client).translate_block(
            session, paper, block
        )

    assert result.id == cached.id
    assert result.translated_text == "Cached translation"
    assert fake_client.calls == []


def test_stale_source_hash_bypasses_old_cache(client) -> None:
    fake_client = FakeTranslationClient("Fresh translation")
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session, source_hash="hash-new")
        _add_completed_translation(session, paper, block, source_hash="hash-old")

        result = BlockTranslationService(fake_client).translate_block(
            session, paper, block
        )
        session.commit()
        result_source_hash = result.source_hash
        result_text = result.translated_text

    assert result_source_hash == "hash-new"
    assert result_text == "Fresh translation"
    assert len(fake_client.calls) == 1


def test_force_refresh_bypasses_matching_cache(client) -> None:
    fake_client = FakeTranslationClient("Forced translation")
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session)
        _add_completed_translation(session, paper, block, source_hash=block.source_hash)

        result = BlockTranslationService(fake_client).translate_block(
            session, paper, block, force_refresh=True
        )
        session.commit()
        result_text = result.translated_text

    assert result_text == "Forced translation"
    assert len(fake_client.calls) == 1


def test_empty_block_text_is_rejected_without_model_call(client) -> None:
    fake_client = FakeTranslationClient()
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session, text="   ")

        with pytest.raises(ValueError, match="translatable text"):
            BlockTranslationService(fake_client).translate_block(session, paper, block)

    assert fake_client.calls == []


def test_model_success_stores_completed_translation(client) -> None:
    fake_client = FakeTranslationClient("Translated result")
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session)

        result = BlockTranslationService(fake_client).translate_block(
            session, paper, block
        )
        session.commit()

        persisted = session.get(PaperBlockTranslation, result.id)
        block_source_hash = block.source_hash
        persisted_status = persisted.status
        persisted_text = persisted.translated_text
        persisted_hash = persisted.source_hash

    assert persisted is not None
    assert persisted_status == PaperBlockTranslationStatus.COMPLETED
    assert persisted_text == "Translated result"
    assert persisted_hash == block_source_hash


def test_model_failure_preserves_previous_completed_translation(client) -> None:
    failing_client = FailingTranslationClient()
    with Session(engine) as session:
        paper, block = _create_paper_and_block(session)
        previous = _add_completed_translation(
            session, paper, block, source_hash=block.source_hash
        )

        failed = BlockTranslationService(failing_client).translate_block(
            session, paper, block, force_refresh=True
        )
        session.commit()
        completed = session.exec(
            select(PaperBlockTranslation).where(
                PaperBlockTranslation.id == previous.id,
                PaperBlockTranslation.status == PaperBlockTranslationStatus.COMPLETED,
            )
        ).one()
        failed_status = failed.status
        failed_error = failed.error_message
        completed_text = completed.translated_text

    assert failed_status == PaperBlockTranslationStatus.FAILED
    assert failed_error == "model unavailable"
    assert completed_text == "Cached translation"
    assert len(failing_client.calls) == 1


def test_deepseek_block_translation_wrapper_builds_safe_prompt(monkeypatch) -> None:
    captured: dict = {}
    client = DeepSeekClient(api_base="https://llm.example.com/v1", api_key="test-key")

    def fake_stream(endpoint: str, request_body: dict) -> str:
        captured["endpoint"] = endpoint
        captured["request_body"] = request_body
        return "Translated by model"

    monkeypatch.setattr(client, "_stream_chat", fake_stream)

    result = client.translate_block_text(
        text="Block text only",
        target_language="zh-CN",
        model="gpt-5.4",
        page_index=2,
        block_type="table",
    )

    request_text = str(captured["request_body"]["messages"])
    assert result == {
        "translated_text": "Translated by model",
        "model_name": "gpt-5.4",
        "prompt_version": BLOCK_TRANSLATION_PROMPT_VERSION,
    }
    assert captured["endpoint"] == "https://llm.example.com/v1/chat/completions"
    assert captured["request_body"]["model"] == "gpt-5.4"
    assert "Block text only" in request_text
    assert "/tmp/" not in request_text
    assert "user_notes" not in request_text
