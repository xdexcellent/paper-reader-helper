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
    assert candidates[3].asset_path == "images/figure-1.jpg"
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


def test_rebuild_blocks_extracts_representative_image_from_zip(client, tmp_path) -> None:
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            json.dumps(
                [
                    {
                        "type": "image",
                        "image_caption": ["Figure 1. Overview."],
                        "img_path": "images/figure-1.png",
                        "bbox": [10, 20, 510, 420],
                        "page_idx": 1,
                    }
                ]
            ),
        )
        archive.writestr("images/figure-1.png", b"fake image bytes")

    with Session(engine) as session:
        paper = _create_paper(session)
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path=str(zip_path),
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()
        blocks = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper.id)
        ).all()

    representative_path = Path(result.representative_image_path)
    assert representative_path.is_file()
    assert representative_path.read_bytes() == b"fake image bytes"
    assert representative_path.parent.name == "representative-images"
    assert blocks[0].asset_path == "images/figure-1.png"


def test_representative_image_prefers_captioned_body_figure_over_cover_art(client, tmp_path) -> None:
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            json.dumps(
                [
                    {
                        "type": "image",
                        "img_path": "images/cover-logo.png",
                        "bbox": [10, 10, 80, 70],
                        "page_idx": 0,
                    },
                    {
                        "type": "image",
                        "image_caption": ["Figure 1. Proposed method overview."],
                        "img_path": "images/figure-1.png",
                        "bbox": [20, 50, 720, 520],
                        "page_idx": 1,
                    },
                ]
            ),
        )
        archive.writestr("images/cover-logo.png", b"cover")
        archive.writestr("images/figure-1.png", b"figure")

    with Session(engine) as session:
        paper = _create_paper(session)
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path=str(zip_path),
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()

    assert Path(result.representative_image_path).read_bytes() == b"figure"


def test_rebuild_blocks_extracts_nested_mineru_v2_image_source_path(client, tmp_path) -> None:
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list_v2.json",
            json.dumps(
                [
                    [
                        {
                            "type": "image",
                            "content": {
                                "image_source": {"path": "images/figure-v2.jpg"},
                                "image_caption": ["Figure 1. V2 overview."],
                            },
                            "bbox": [0.1, 0.2, 0.8, 0.7],
                        }
                    ]
                ]
            ),
        )
        archive.writestr("images/figure-v2.jpg", b"nested image bytes")

    with Session(engine) as session:
        paper = _create_paper(session)
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path=str(zip_path),
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()
        block = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper.id)
        ).one()

    assert block.asset_path == "images/figure-v2.jpg"
    assert Path(result.representative_image_path).read_bytes() == b"nested image bytes"


def test_rebuild_blocks_downloads_remote_zip_and_extracts_image(client, tmp_path, monkeypatch) -> None:
    """当 full_zip_path 是远程 URL 时，rebuild_blocks 应下载 ZIP 并提取代表图。"""
    # 准备本地 ZIP 内容
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            json.dumps(
                [
                    {
                        "type": "image",
                        "image_caption": ["Figure 1. Remote overview."],
                        "img_path": "images/remote-fig.png",
                        "bbox": [10, 20, 510, 420],
                        "page_idx": 1,
                    }
                ]
            ),
        )
        archive.writestr("images/remote-fig.png", b"remote image bytes")
    zip_bytes = zip_path.read_bytes()

    # Mock HTTP 客户端，返回预置的 ZIP 内容
    class FakeResponse:
        status_code = 200
        content = zip_bytes

        def raise_for_status(self):
            pass

    class FakeClient:
        def get(self, url, **kwargs):
            return FakeResponse()

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.http_client_factory.get_http_client",
        lambda **kwargs: FakeClient(),
    )

    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path="https://cdn.mineru.net/result/abc123.zip",
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()

    # 代表图应成功提取
    assert result.representative_image_path
    representative_path = Path(result.representative_image_path)
    assert representative_path.is_file()
    assert representative_path.read_bytes() == b"remote image bytes"

    # full_zip_path 应被更新为本地路径
    with Session(engine) as session:
        updated_content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).first()
        assert not updated_content.full_zip_path.startswith("http")
        assert Path(updated_content.full_zip_path).exists()


def test_rebuild_blocks_remote_zip_download_failure_graceful_fallback(client, tmp_path, monkeypatch) -> None:
    """远程 ZIP 下载失败时应优雅降级，不崩溃，返回空代表图。"""

    def fake_get_http_client(**kwargs):
        class FakeClient:
            def get(self, url, **kw):
                raise RuntimeError("Network error")

            def close(self):
                pass

        return FakeClient()

    monkeypatch.setattr(
        "app.services.http_client_factory.get_http_client",
        fake_get_http_client,
    )

    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path="https://cdn.mineru.net/result/failing.zip",
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()

    # 不应崩溃，代表图为空
    assert result.representative_image_path == ""
    # full_zip_path 应保持不变（远程 URL）
    with Session(engine) as session:
        updated_content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).first()
        assert updated_content.full_zip_path.startswith("https://")


def test_rebuild_blocks_remote_zip_invalid_content_graceful_fallback(client, tmp_path, monkeypatch) -> None:
    """远程 URL 返回非 ZIP 内容时应优雅降级，不写入无效文件。"""

    class FakeResponse:
        status_code = 200
        content = b"<html>Error page</html>"

        def raise_for_status(self):
            pass

    class FakeClient:
        def get(self, url, **kwargs):
            return FakeResponse()

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.http_client_factory.get_http_client",
        lambda **kwargs: FakeClient(),
    )

    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path="https://cdn.mineru.net/result/invalid.zip",
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()

    # 不应崩溃，代表图为空
    assert result.representative_image_path == ""
    # 不应写入无效的 ZIP 文件
    mineru_dir = Path(local_pdf).resolve().parent / "mineru"
    assert not (mineru_dir / "result.zip").exists()
    # full_zip_path 应保持不变（远程 URL）
    with Session(engine) as session:
        updated_content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).first()
        assert updated_content.full_zip_path.startswith("https://")


def test_rebuild_blocks_local_zip_still_works_as_before(client, tmp_path) -> None:
    """本地 ZIP 路径仍走原有快速路径，不触发下载。"""
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            json.dumps(
                [
                    {
                        "type": "image",
                        "image_caption": ["Figure 1. Local test."],
                        "img_path": "images/local-fig.png",
                        "bbox": [10, 20, 510, 420],
                        "page_idx": 0,
                    }
                ]
            ),
        )
        archive.writestr("images/local-fig.png", b"local image bytes")

    with Session(engine) as session:
        paper = _create_paper(session)
        paper_id = paper.id
        local_pdf = tmp_path / "stored-paper.pdf"
        local_pdf.write_bytes(b"%PDF-1.4")
        paper.local_pdf_path = str(local_pdf)
        session.add(paper)
        content = PaperContent(
            paper_id=paper.id,
            full_markdown="# Parsed",
            content_json_path="",
            full_zip_path=str(zip_path),
        )
        session.add(content)
        session.commit()

        result = BlockExtractionService().rebuild_blocks(session, paper, content)
        session.commit()

    assert result.representative_image_path
    assert Path(result.representative_image_path).read_bytes() == b"local image bytes"
    # full_zip_path 不应被修改（仍是原始本地路径）
    with Session(engine) as session:
        updated_content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).first()
        assert updated_content.full_zip_path == str(zip_path)


def test_rebuild_representative_images_api(client, tmp_path, monkeypatch) -> None:
    """POST /papers/rebuild-representative-images 批量补救端点。"""
    # 准备远程 ZIP 内容
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            json.dumps(
                [
                    {
                        "type": "image",
                        "image_caption": ["Figure 1. Batch rebuild."],
                        "img_path": "images/batch-fig.png",
                        "bbox": [10, 20, 510, 420],
                        "page_idx": 0,
                    }
                ]
            ),
        )
        archive.writestr("images/batch-fig.png", b"batch image bytes")
    zip_bytes = zip_path.read_bytes()

    class FakeResponse:
        status_code = 200
        content = zip_bytes

        def raise_for_status(self):
            pass

    class FakeClient:
        def get(self, url, **kwargs):
            return FakeResponse()

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.http_client_factory.get_http_client",
        lambda **kwargs: FakeClient(),
    )

    # 创建两篇论文：一篇缺少代表图（远程 ZIP），一篇已有代表图（应被跳过）
    with Session(engine) as session:
        # 论文 1：缺少代表图，远程 ZIP
        paper1 = Paper(source="manual", title="Missing Image Paper", local_pdf_path="/tmp/paper.pdf")
        local_pdf1 = tmp_path / "paper1" / "stored-paper.pdf"
        local_pdf1.parent.mkdir(parents=True, exist_ok=True)
        local_pdf1.write_bytes(b"%PDF-1.4")
        paper1.local_pdf_path = str(local_pdf1)
        session.add(paper1)
        session.commit()
        session.refresh(paper1)
        content1 = PaperContent(
            paper_id=paper1.id,
            full_markdown="# Parsed",
            full_zip_path="https://cdn.mineru.net/result/batch1.zip",
        )
        session.add(content1)
        paper1.parse_status = "completed"
        paper1.representative_image_path = ""
        session.add(paper1)
        session.commit()

        paper1_id = paper1.id

        # 论文 2：已有代表图，应被跳过
        paper2 = Paper(source="manual", title="Has Image Paper", local_pdf_path="/tmp/paper2.pdf")
        paper2.parse_status = "completed"
        paper2.representative_image_path = "/some/existing/image.png"
        session.add(paper2)
        session.commit()

    response = client.post("/papers/rebuild-representative-images")
    assert response.status_code == 200
    body = response.json()
    # 论文 2 已有代表图，不会被查询到
    assert body["total"] == 1
    assert body["success"] == 1
    assert body["failure"] == 0

    # 验证论文 1 的代表图已被提取
    with Session(engine) as session:
        updated_paper = session.get(Paper, paper1_id)
        assert updated_paper.representative_image_path != ""
        assert Path(updated_paper.representative_image_path).exists()
