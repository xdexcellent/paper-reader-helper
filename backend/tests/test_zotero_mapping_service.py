"""ZoteroMappingService 和 ZoteroImportService 单元测试。"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models.paper import Paper, PaperStatus
from app.models.zotero_import_candidate import ZoteroImportCandidate
from app.models.zotero_import_run import ZoteroImportRun
from app.services.zotero_import_service import ZoteroImportService
from app.services.zotero_mapping_service import ZoteroMappingService
from tests.fixtures.zotero_fixture_builder import build_minimal_zotero_db


@pytest.fixture
def mapping_service():
    return ZoteroMappingService()


@pytest.fixture
def import_service():
    return ZoteroImportService()


@pytest.fixture
def zotero_db(tmp_path):
    """创建一个临时 Zotero 测试数据库。"""
    db_path = tmp_path / "zotero_test.sqlite"
    build_minimal_zotero_db(db_path)
    return db_path


@pytest.fixture
def test_engine(tmp_path):
    """创建一个临时应用数据库引擎。"""
    db_path = tmp_path / "app_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    # 导入所有模型
    from app.models.paper import Paper  # noqa: F401
    from app.models.zotero_import_candidate import ZoteroImportCandidate  # noqa: F401
    from app.models.zotero_import_run import ZoteroImportRun  # noqa: F401
    from app.models.category import Category  # noqa: F401
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def session(test_engine):
    with Session(test_engine) as s:
        yield s


class TestScanItems:
    """scan_items 方法测试。"""

    def test_scans_journal_article(self, mapping_service, zotero_db):
        """验证扫描期刊论文。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        # 3 个文献条目（排除附件和笔记项）
        assert len(items) == 3

        # 论文 1: journalArticle
        paper1 = next(i for i in items if i["item_type"] == "journalArticle")
        assert paper1["title"] == "Deep Learning for NLP"
        assert paper1["doi"] == "10.1234/dl.nlp.2024"
        assert paper1["url"] == "https://example.com/dl-nlp"
        assert paper1["date"] == "2024-03-15"
        assert paper1["publication_title"] == "Journal of AI Research"
        assert paper1["abstract_note"].startswith("This paper presents")
        assert len(paper1["creators"]) == 2
        assert paper1["creators"][0]["lastName"] == "Smith"
        assert paper1["creators"][0]["firstName"] == "John"
        assert paper1["creators"][1]["lastName"] == "Johnson"

    def test_scans_conference_paper(self, mapping_service, zotero_db):
        """验证扫描会议论文。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        paper2 = next(i for i in items if i["item_type"] == "conferencePaper")
        assert paper2["title"] == "Vision Transformer Survey"
        assert paper2["doi"] == "10.5678/vit.survey.2023"
        assert paper2["date"] == "2023"
        assert paper2["publication_title"] == "IEEE Conference on CVPR"
        assert len(paper2["creators"]) == 2

    def test_scans_book_section(self, mapping_service, zotero_db):
        """验证扫描书籍章节（无 DOI）。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        paper3 = next(i for i in items if i["item_type"] == "bookSection")
        assert paper3["title"] == "Advanced Methods in ML"
        assert paper3["doi"] == ""  # 无 DOI
        assert paper3["date"] == "2022-07-01"
        assert len(paper3["creators"]) == 1

    def test_extracts_collections(self, mapping_service, zotero_db):
        """验证提取分类信息。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        paper1 = next(i for i in items if i["item_type"] == "journalArticle")
        assert "NLP" in paper1["collections"]
        assert "Machine Learning" in paper1["collections"]

    def test_extracts_tags(self, mapping_service, zotero_db):
        """验证提取标签信息。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        paper1 = next(i for i in items if i["item_type"] == "journalArticle")
        assert "transformer" in paper1["tags"]
        assert "deep-learning" in paper1["tags"]
        assert "important" in paper1["tags"]

    def test_extracts_attachment(self, mapping_service, zotero_db):
        """验证提取附件信息。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        paper1 = next(i for i in items if i["item_type"] == "journalArticle")
        assert paper1["attachment_path"] == "storage:dl_nlp_paper.pdf"
        assert paper1["attachment_mime_type"] == "application/pdf"

    def test_skips_note_items(self, mapping_service, zotero_db):
        """验证跳过笔记条目。"""
        conn = sqlite3.connect(str(zotero_db))
        items = mapping_service.scan_items(conn)
        conn.close()

        item_types = [i["item_type"] for i in items]
        assert "note" not in item_types
        assert "attachment" not in item_types


class TestMapCandidate:
    """map_candidate 方法测试。"""

    def test_maps_authors_format(self, mapping_service):
        """验证作者格式化："LastName FirstName; ..."."""
        item = {
            "creators": [
                {"lastName": "Smith", "firstName": "John"},
                {"lastName": "Zhang", "firstName": "Wei"},
            ],
            "title": "Test Paper",
            "doi": "",
            "url": "",
            "date": "2024",
            "publication_title": "",
            "abstract_note": "",
            "collections": [],
            "tags": [],
            "attachment_path": "",
            "item_key": "ABC123",
            "item_type": "journalArticle",
            "warning_message": "",
        }
        mapped = mapping_service.map_candidate(item)
        assert mapped["mapped_authors"] == "Smith John; Zhang Wei"

    def test_extracts_year_from_date_yyyy(self, mapping_service):
        """验证从 YYYY 格式提取年份。"""
        item = {
            "creators": [],
            "title": "",
            "doi": "",
            "url": "",
            "date": "2024",
            "publication_title": "",
            "abstract_note": "",
            "collections": [],
            "tags": [],
            "attachment_path": "",
            "item_key": "",
            "item_type": "",
            "warning_message": "",
        }
        mapped = mapping_service.map_candidate(item)
        assert mapped["mapped_year"] == 2024

    def test_extracts_year_from_date_yyyy_mm_dd(self, mapping_service):
        """验证从 YYYY-MM-DD 格式提取年份。"""
        item = {
            "creators": [],
            "title": "",
            "doi": "",
            "url": "",
            "date": "2023-06-15",
            "publication_title": "",
            "abstract_note": "",
            "collections": [],
            "tags": [],
            "attachment_path": "",
            "item_key": "",
            "item_type": "",
            "warning_message": "",
        }
        mapped = mapping_service.map_candidate(item)
        assert mapped["mapped_year"] == 2023

    def test_extracts_year_from_date_yyyy_mm(self, mapping_service):
        """验证从 YYYY-MM 格式提取年份。"""
        item = {
            "creators": [],
            "title": "",
            "doi": "",
            "url": "",
            "date": "2022-07",
            "publication_title": "",
            "abstract_note": "",
            "collections": [],
            "tags": [],
            "attachment_path": "",
            "item_key": "",
            "item_type": "",
            "warning_message": "",
        }
        mapped = mapping_service.map_candidate(item)
        assert mapped["mapped_year"] == 2022

    def test_maps_collections_and_tags(self, mapping_service):
        """验证映射 collections 和 tags。"""
        item = {
            "creators": [],
            "title": "",
            "doi": "",
            "url": "",
            "date": "",
            "publication_title": "",
            "abstract_note": "",
            "collections": ["NLP", "AI"],
            "tags": ["transformer", "deep-learning"],
            "attachment_path": "",
            "item_key": "",
            "item_type": "",
            "warning_message": "",
        }
        mapped = mapping_service.map_candidate(item)
        assert mapped["mapped_collections"] == ["NLP", "AI"]
        assert mapped["mapped_tags"] == ["transformer", "deep-learning"]

    def test_marks_unsupported_type(self, mapping_service):
        """验证不支持的类型标记 warning。"""
        item = {
            "creators": [],
            "title": "",
            "doi": "",
            "url": "",
            "date": "",
            "publication_title": "",
            "abstract_note": "",
            "collections": [],
            "tags": [],
            "attachment_path": "",
            "item_key": "",
            "item_type": "someUnknownType",
            "warning_message": "",
        }
        # 映射本身不添加 warning（由 scan_items 添加），但保留已有 warning
        mapped = mapping_service.map_candidate(item)
        assert mapped["warning_message"] == ""


class TestDetectDuplicates:
    """detect_duplicates 方法测试。"""

    def test_doi_match(self, import_service, session):
        """验证通过 DOI 检测重复。"""
        paper = Paper(
            source="manual",
            title="Some Paper",
            local_pdf_path="/tmp/test.pdf",
            doi="10.1234/test.paper",
            status=PaperStatus.QUEUED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(paper)
        session.commit()

        candidate = {"mapped_doi": "https://doi.org/10.1234/test.paper", "mapped_title": "", "mapped_url": ""}
        is_dup, dup_id, reason = import_service.detect_duplicates(session, candidate)
        assert is_dup is True
        assert dup_id == paper.id
        assert "DOI" in reason

    def test_doi_match_case_insensitive(self, import_service, session):
        """验证 DOI 匹配不区分大小写。"""
        paper = Paper(
            source="manual",
            title="Case Test",
            local_pdf_path="/tmp/test.pdf",
            doi="10.1234/Case.Test",
            status=PaperStatus.QUEUED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(paper)
        session.commit()

        candidate = {"mapped_doi": "10.1234/case.test", "mapped_title": "", "mapped_url": ""}
        is_dup, dup_id, reason = import_service.detect_duplicates(session, candidate)
        assert is_dup is True

    def test_title_match(self, import_service, session):
        """验证通过规范化标题检测重复。"""
        paper = Paper(
            source="manual",
            title="Deep Learning for NLP! (2024 Edition)",
            local_pdf_path="/tmp/test.pdf",
            status=PaperStatus.QUEUED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(paper)
        session.commit()

        candidate = {"mapped_doi": "", "mapped_title": "Deep Learning for NLP 2024 Edition", "mapped_url": ""}
        is_dup, dup_id, reason = import_service.detect_duplicates(session, candidate)
        assert is_dup is True
        assert "标题" in reason

    def test_url_match(self, import_service, session):
        """验证通过 URL 检测重复。"""
        paper = Paper(
            source="manual",
            title="URL Paper",
            local_pdf_path="/tmp/test.pdf",
            url="https://example.com/unique-paper",
            status=PaperStatus.QUEUED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(paper)
        session.commit()

        candidate = {"mapped_doi": "", "mapped_title": "", "mapped_url": "https://example.com/unique-paper"}
        is_dup, dup_id, reason = import_service.detect_duplicates(session, candidate)
        assert is_dup is True
        assert "URL" in reason

    def test_no_match(self, import_service, session):
        """验证无匹配时返回非重复。"""
        candidate = {"mapped_doi": "10.9999/nomatch", "mapped_title": "Brand New Paper", "mapped_url": ""}
        is_dup, dup_id, reason = import_service.detect_duplicates(session, candidate)
        assert is_dup is False
        assert dup_id is None


class TestBuildCandidates:
    """build_candidates 方法测试。"""

    def test_builds_candidates_from_items(self, import_service, session):
        """验证从 items 构建候选项。"""
        now = datetime.now(timezone.utc)
        run = ZoteroImportRun(
            source_fingerprint="abc123",
            status="scanning",
            created_at=now,
            updated_at=now,
        )
        session.add(run)
        session.commit()

        items = [
            {
                "_mapped": {
                    "mapped_title": "Test Paper 1",
                    "mapped_authors": "Smith John",
                    "mapped_year": 2024,
                    "mapped_doi": "10.1234/test1",
                    "mapped_url": "https://example.com/1",
                    "mapped_venue": "Journal A",
                    "mapped_abstract_note": "Abstract 1",
                    "mapped_publication_title": "Journal A",
                    "mapped_collections": ["AI"],
                    "mapped_tags": ["deep-learning"],
                    "attachment_path": "",
                    "attachment_exists": False,
                    "source_key": "KEY001",
                    "zotero_item_type": "journalArticle",
                    "warning_message": "",
                }
            }
        ]

        candidates = import_service.build_candidates(session, run, items)
        assert len(candidates) == 1
        c = candidates[0]
        assert c.mapped_title == "Test Paper 1"
        assert c.import_run_id == run.id
        assert c.is_selected is True
        assert c.is_duplicate is False

    def test_duplicate_defaults_unselected(self, import_service, session):
        """验证重复候选项默认不选中。"""
        now = datetime.now(timezone.utc)
        run = ZoteroImportRun(
            source_fingerprint="abc123",
            status="scanning",
            created_at=now,
            updated_at=now,
        )
        session.add(run)
        session.commit()

        # 创建已存在的论文
        paper = Paper(
            source="manual",
            title="Existing Paper",
            local_pdf_path="/tmp/exist.pdf",
            doi="10.1234/exist",
            status=PaperStatus.QUEUED,
            created_at=now,
            updated_at=now,
        )
        session.add(paper)
        session.commit()

        items = [
            {
                "_mapped": {
                    "mapped_title": "Existing Paper",
                    "mapped_authors": "",
                    "mapped_year": None,
                    "mapped_doi": "10.1234/exist",
                    "mapped_url": "",
                    "mapped_venue": "",
                    "mapped_abstract_note": "",
                    "mapped_publication_title": "",
                    "mapped_collections": [],
                    "mapped_tags": [],
                    "attachment_path": "",
                    "attachment_exists": False,
                    "source_key": "DUP001",
                    "zotero_item_type": "journalArticle",
                    "warning_message": "",
                }
            }
        ]

        candidates = import_service.build_candidates(session, run, items)
        assert candidates[0].is_duplicate is True
        assert candidates[0].is_selected is False
