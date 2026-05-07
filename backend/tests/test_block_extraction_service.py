import json
import zipfile
from pathlib import Path

from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_block_translation import PaperBlockTranslation
from app.models.paper_content import PaperContent
from app.services.block_extraction_service import (
    MAX_SOURCE_JSON_CHARS,
    BlockExtractionService,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mineru_blocks_sample.json"


def _fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _create_paper(session: Session) -> Paper:
    paper = Paper(source="manual", title="Block Paper", local_pdf_path="/tmp/paper.pdf")
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def test_normalizes_legacy_content_list_supported_block_types() -> None:
    candidates = BlockExtractionService().extract_from_json(_fixture()["content_list"])

    assert [candidate.block_type for candidate in candidates] == [
        "title",
        "text",
        "table",
        "image",
        "chart",
        "formula",
        "list",
        "code",
        "unknown",
    ]
    assert [candidate.block_index for candidate in candidates] == list(range(9))
    assert candidates[0].page_index == 0
    assert candidates[0].text == "1 Introduction"
    assert candidates[0].bbox == [62.0, 80.0, 946.0, 120.0]
    assert "Table 1. Results." in candidates[2].text
    assert "print('ok')" in candidates[7].text
    assert candidates[8].text == ""
    assert candidates[8].source_hash


def test_normalizes_content_list_v2_and_vlm_page_grouped_shapes() -> None:
    fixture = _fixture()
    service = BlockExtractionService()

    v2_candidates = service.extract_from_json(fixture["content_list_v2"])
    vlm_candidates = service.extract_from_json(fixture["vlm_model"])

    assert [candidate.block_type for candidate in v2_candidates] == [
        "title",
        "text",
        "formula",
        "code",
        "list",
    ]
    assert [candidate.page_index for candidate in v2_candidates] == [0, 0, 0, 0, 1]
    assert v2_candidates[2].text == "a^2 + b^2 = c^2"
    assert v2_candidates[4].text == "alpha\nbeta"
    assert [candidate.block_type for candidate in vlm_candidates] == [
        "title",
        "text",
        "table",
    ]
    assert vlm_candidates[0].bbox == [100.0, 200.0, 800.0, 250.0]


def test_normalizes_pipeline_middle_json_blocks() -> None:
    candidates = BlockExtractionService().extract_from_json(_fixture()["middle"])

    assert [candidate.block_type for candidate in candidates] == ["text", "table"]
    assert [candidate.page_index for candidate in candidates] == [4, 4]
    assert candidates[0].text == "Middle paragraph"
    assert candidates[1].text == "Middle table"


def test_malformed_entries_are_recoverable_and_invalid_bbox_is_ignored() -> None:
    candidates = BlockExtractionService().extract_from_json(_fixture()["malformed"])

    assert len(candidates) == 1
    assert candidates[0].page_index is None
    assert candidates[0].bbox is None
    assert candidates[0].text == "Bad bbox survives"


def test_source_hash_is_stable_and_source_json_is_bounded() -> None:
    service = BlockExtractionService()
    block_a = {"type": "text", "text": "Stable", "bbox": [1, 2, 3, 4], "page_idx": 0}
    block_b = {"page_idx": 0, "bbox": [1, 2, 3, 4], "text": "Stable", "type": "text"}
    changed = {"type": "text", "text": "Changed", "bbox": [1, 2, 3, 4], "page_idx": 0}
    oversized = {"type": "text", "text": "Bounded", "debug": "x" * 6000}

    stable_a = service.extract_from_json([block_a])[0]
    stable_b = service.extract_from_json([block_b])[0]
    changed_candidate = service.extract_from_json([changed])[0]
    bounded_candidate = service.extract_from_json([oversized])[0]

    assert stable_a.source_hash == stable_b.source_hash
    assert stable_a.source_hash != changed_candidate.source_hash
    assert len(bounded_candidate.source_json) <= MAX_SOURCE_JSON_CHARS
    assert bounded_candidate.source_json.endswith("...<truncated>")


def test_empty_payload_returns_no_blocks() -> None:
    assert BlockExtractionService().extract_from_json(_fixture()["empty"]) == []


def test_extracts_from_local_json_and_zip_parse_artifacts(tmp_path) -> None:
    fixture = _fixture()
    content_path = tmp_path / "paper_content_list.json"
    zip_path = tmp_path / "mineru_result.zip"
    content_path.write_text(json.dumps(fixture["content_list"]), encoding="utf-8")
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("paper.md", "# ignored")
        archive.writestr("paper_content_list.json", json.dumps(fixture["content_list_v2"]))

    service = BlockExtractionService()
    json_candidates = service.extract_from_parse_result(
        {"content_json_path": str(content_path), "full_zip_path": ""}
    )
    zip_candidates = service.extract_from_parse_result(
        {"content_json_path": "", "full_zip_path": str(zip_path)}
    )

    assert json_candidates[0].block_type == "title"
    assert len(json_candidates) == 9
    assert [candidate.block_type for candidate in zip_candidates] == [
        "title",
        "text",
        "formula",
        "code",
        "list",
    ]


def test_replace_blocks_deletes_stale_blocks_and_translations(client) -> None:
    candidates = BlockExtractionService().extract_from_json(_fixture()["content_list"][:2])

    with Session(engine) as session:
        paper = _create_paper(session)
        stale_block = PaperBlock(
            paper_id=paper.id,
            page_index=9,
            block_index=99,
            block_type="text",
            text="stale",
            source_hash="old-hash",
        )
        session.add(stale_block)
        session.commit()
        session.refresh(stale_block)
        session.add(
            PaperBlockTranslation(
                paper_id=paper.id,
                block_id=stale_block.id,
                target_language="zh-CN",
                model_name="gpt-5.4",
                prompt_version="block-translate-v1",
                source_hash="old-hash",
                translated_text="old translation",
            )
        )
        session.commit()

        count = BlockExtractionService().replace_blocks(session, paper.id, candidates)
        session.commit()

        blocks = session.exec(
            select(PaperBlock)
            .where(PaperBlock.paper_id == paper.id)
            .order_by(PaperBlock.block_index)
        ).all()
        translations = session.exec(
            select(PaperBlockTranslation).where(
                PaperBlockTranslation.paper_id == paper.id
            )
        ).all()

    assert count == 2
    assert [block.text for block in blocks] == ["1 Introduction", "Body paragraph text."]
    assert [block.block_index for block in blocks] == [0, 1]
    assert translations == []


def test_rebuild_blocks_uses_stored_parse_artifact(client, tmp_path) -> None:
    content_path = tmp_path / "paper_content_list.json"
    content_path.write_text(json.dumps(_fixture()["content_list"][:3]), encoding="utf-8")

    with Session(engine) as session:
        paper = _create_paper(session)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path=str(content_path),
            full_zip_path="",
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()
        blocks = session.exec(
            select(PaperBlock)
            .where(PaperBlock.paper_id == paper.id)
            .order_by(PaperBlock.block_index)
        ).all()

    assert result.paper_id == paper.id
    assert result.block_count == 3
    assert result.has_blocks is True
    assert [block.block_type for block in blocks] == ["title", "text", "table"]
