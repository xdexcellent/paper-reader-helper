import json

from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import (
    PaperBlockTranslation,
    PaperBlockTranslationStatus,
)
from app.models.paper_content import PaperContent
from app.services.block_translation_service import BLOCK_TRANSLATION_PROMPT_VERSION


def _create_paper(session: Session, title: str = "Block API Paper") -> Paper:
    paper = Paper(source="manual", title=title, local_pdf_path="/tmp/paper.pdf")
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def _add_block(
    session: Session,
    paper_id: int,
    block_index: int,
    block_type: str,
    text: str,
    *,
    page_index: int | None = 0,
) -> PaperBlock:
    block = PaperBlock(
        paper_id=paper_id,
        page_index=page_index,
        block_index=block_index,
        block_type=block_type,
        text=text,
        bbox_json="[1.0, 2.0, 3.0, 4.0]",
        source_hash=f"hash-{block_index}",
        source_json='{"safe":true}',
    )
    session.add(block)
    session.commit()
    session.refresh(block)
    return block


def _add_translation(
    session: Session,
    paper_id: int,
    block: PaperBlock,
    translated_text: str = "Cached block translation",
) -> PaperBlockTranslation:
    translation = PaperBlockTranslation(
        paper_id=paper_id,
        block_id=block.id,
        target_language="zh-CN",
        model_name="gpt-5.4",
        prompt_version=BLOCK_TRANSLATION_PROMPT_VERSION,
        source_hash=block.source_hash,
        translated_text=translated_text,
        status=PaperBlockTranslationStatus.COMPLETED,
    )
    session.add(translation)
    session.commit()
    session.refresh(translation)
    return translation


def test_get_paper_blocks_returns_ordered_blocks_and_summary(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        _add_block(session, paper.id, 2, "table", "Table block", page_index=1)
        _add_block(session, paper.id, 0, "title", "Title block", page_index=0)
        _add_block(session, paper.id, 1, "text", "Body block", page_index=0)

    response = client.get(f"/papers/{paper_id}/blocks")

    assert response.status_code == 200
    body = response.json()
    assert body["paper_id"] == paper_id
    assert body["total"] == 3
    assert body["returned"] == 3
    assert body["pages"] == [0, 1]
    assert body["block_types"] == {"table": 1, "text": 1, "title": 1}
    assert body["has_blocks"] is True
    assert [block["text"] for block in body["blocks"]] == [
        "Title block",
        "Body block",
        "Table block",
    ]
    assert body["blocks"][0]["bbox"] == [1.0, 2.0, 3.0, 4.0]
    assert "source_json" not in body["blocks"][0]


def test_get_paper_blocks_returns_empty_state(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id

    response = client.get(f"/papers/{paper_id}/blocks")

    assert response.status_code == 200
    assert response.json() == {
        "paper_id": paper_id,
        "total": 0,
        "returned": 0,
        "pages": [],
        "block_types": {},
        "has_blocks": False,
        "blocks": [],
        "error": "",
    }


def test_get_paper_blocks_returns_404_for_missing_paper(client) -> None:
    response = client.get("/papers/999/blocks")

    assert response.status_code == 404


def test_get_paper_blocks_filters_by_page_type_and_search(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        _add_block(session, paper.id, 0, "title", "Method overview", page_index=0)
        _add_block(session, paper.id, 1, "text", "Neural network details", page_index=1)
        _add_block(session, paper.id, 2, "table", "Neural results table", page_index=1)

    response = client.get(
        f"/papers/{paper_id}/blocks",
        params={"page": 1, "type": "table", "search": "neural"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert body["returned"] == 1
    assert body["blocks"][0]["block_type"] == "table"
    assert body["blocks"][0]["text"] == "Neural results table"


def test_rebuild_paper_blocks_from_parse_artifact(client, tmp_path) -> None:
    content_path = tmp_path / "paper_content_list.json"
    content_path.write_text(
        json.dumps(
            [
                {
                    "type": "text",
                    "text": "API rebuilt block",
                    "bbox": [10, 20, 30, 40],
                    "page_idx": 0,
                }
            ]
        ),
        encoding="utf-8",
    )

    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        session.add(
            PaperContent(
                paper_id=paper.id,
                full_markdown="# Parsed",
                content_json_path=str(content_path),
                full_zip_path="",
            )
        )
        session.commit()

    response = client.post(f"/papers/{paper_id}/blocks/rebuild")

    assert response.status_code == 200
    body = response.json()
    assert body["paper_id"] == paper_id
    assert body["block_count"] == 1
    assert body["has_blocks"] is True

    with Session(engine) as session:
        blocks = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper_id)
        ).all()

    assert len(blocks) == 1
    assert blocks[0].text == "API rebuilt block"


def test_rebuild_paper_blocks_returns_409_without_parse_artifact(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        session.add(PaperContent(paper_id=paper.id, full_markdown="# Parsed"))
        session.commit()

    response = client.post(f"/papers/{paper_id}/blocks/rebuild")

    assert response.status_code == 409


def test_translate_paper_block_returns_cached_translation(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        block = _add_block(session, paper.id, 0, "text", "Translate me")
        block_id = block.id
        cached = _add_translation(session, paper.id, block)

    response = client.post(f"/papers/{paper_id}/blocks/{block_id}/translate", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == cached.id
    assert body["translated_text"] == "Cached block translation"
    assert body["status"] == PaperBlockTranslationStatus.COMPLETED


def test_translate_paper_block_calls_model_on_cache_miss(client, monkeypatch) -> None:
    def fake_translate(self, **kwargs):
        return {
            "translated_text": "Fresh API translation",
            "model_name": kwargs["model"],
            "prompt_version": BLOCK_TRANSLATION_PROMPT_VERSION,
        }

    monkeypatch.setattr(
        "app.services.deepseek_client.DeepSeekClient.translate_block_text",
        fake_translate,
    )
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        block = _add_block(session, paper.id, 0, "text", "Translate me")
        block_id = block.id

    response = client.post(
        f"/papers/{paper_id}/blocks/{block_id}/translate",
        json={"target_language": "zh-CN", "model": "gpt-5.4"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["translated_text"] == "Fresh API translation"
    assert body["source_hash"] == "hash-0"


def test_translate_paper_block_force_refresh_bypasses_cache(client, monkeypatch) -> None:
    def fake_translate(self, **kwargs):
        return {
            "translated_text": "Forced API translation",
            "model_name": kwargs["model"],
            "prompt_version": BLOCK_TRANSLATION_PROMPT_VERSION,
        }

    monkeypatch.setattr(
        "app.services.deepseek_client.DeepSeekClient.translate_block_text",
        fake_translate,
    )
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        block = _add_block(session, paper.id, 0, "text", "Translate me")
        block_id = block.id
        _add_translation(session, paper.id, block)

    response = client.post(
        f"/papers/{paper_id}/blocks/{block_id}/translate",
        json={"force_refresh": True},
    )

    assert response.status_code == 200
    assert response.json()["translated_text"] == "Forced API translation"


def test_translate_paper_block_validates_paper_and_block_ownership(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        other_paper = _create_paper(session, title="Other")
        block = _add_block(session, paper.id, 0, "text", "Translate me")
        other_paper_id = other_paper.id
        block_id = block.id

    missing_paper = client.post("/papers/999/blocks/999/translate", json={})
    wrong_owner = client.post(
        f"/papers/{other_paper_id}/blocks/{block_id}/translate",
        json={},
    )

    assert missing_paper.status_code == 404
    assert wrong_owner.status_code == 404


def test_translate_paper_block_rejects_empty_text(client) -> None:
    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        block = _add_block(session, paper.id, 0, "text", "   ")
        block_id = block.id

    response = client.post(f"/papers/{paper_id}/blocks/{block_id}/translate", json={})

    assert response.status_code == 400
