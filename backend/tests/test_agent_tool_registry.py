"""Tests for AgentToolRegistry — read-only tools without sensitive data exposure."""
import json
from pathlib import Path

import pytest


def _seed_paper(session, **kwargs) -> dict:
    """Helper: create a paper and return its id + data."""
    from app.models.category import Category
    from app.models.paper import Paper, CategoryStatus
    from app.models.paper_summary import PaperSummary
    from app.models.paper_block import PaperBlock
    from app.models.paper_block_translation import PaperBlockTranslation

    defaults = {
        "title": "Test Paper",
        "source": "manual",
        "local_pdf_path": "/data/papers/test.pdf",
        "authors": "Author A; Author B",
        "year": 2024,
        "venue": "NeurIPS",
        "doi": "10.1234/test",
        "url": "https://arxiv.org/abs/2401.00001",
        "favorite": False,
        "reading_status": "unread",
        "reading_progress": 0,
        "user_notes": "",
        "status": "ready",
        "parse_status": "completed",
        "summary_status": "completed",
        "tags_json": json.dumps(["llm", "agent"]),
        "primary_category_id": None,
        "category_confidence": 0.0,
        "category_status": CategoryStatus.PENDING_REVIEW,
    }
    for k, v in kwargs.items():
        defaults[k] = v

    paper = Paper(**{k: v for k, v in defaults.items() if k not in ("summary", "blocks", "translations")})
    session.add(paper)
    session.flush()

    if "summary" in kwargs:
        sdata = kwargs["summary"]
        summary = PaperSummary(paper_id=paper.id, **sdata)
        session.add(summary)

    if "blocks" in kwargs:
        for bdata in kwargs["blocks"]:
            block = PaperBlock(paper_id=paper.id, **bdata)
            session.add(block)

    if "translations" in kwargs:
        for tdata in kwargs["translations"]:
            trans = PaperBlockTranslation(paper_id=paper.id, **tdata)
            session.add(trans)

    session.commit()
    session.refresh(paper)
    return {"id": paper.id, "title": paper.title}


def _seed_category(session, **kwargs) -> dict:
    from app.models.category import Category
    defaults = {
        "name": "TestCategory",
        "slug": "test-category",
        "description": "",
        "is_system": True,
        "is_active": True,
        "sort_order": 0,
    }
    defaults.update(kwargs)
    cat = Category(**defaults)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"id": cat.id, "name": cat.name}


# ── list_papers ──────────────────────────────────────────────

def test_list_papers_empty_library(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        result = registry.list_papers(session)
    assert result["error"] is None
    assert result["data"]["papers"] == []
    assert result["truncated"] is False


def test_list_papers_returns_bounded_fields(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        _seed_paper(session, title="Paper One")
        _seed_paper(session, title="Paper Two")
        result = registry.list_papers(session)

    assert result["error"] is None
    papers = result["data"]["papers"]
    assert len(papers) == 2
    for p in papers:
        assert "title" in p
        assert "id" in p
        assert "local_pdf_path" not in p
        assert "abstract_raw" not in p
        assert "tags" not in p


def test_list_papers_truncates_at_max(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry, MAX_LIST_PAPERS

    registry = AgentToolRegistry()
    with Session(engine) as session:
        for i in range(MAX_LIST_PAPERS + 5):
            _seed_paper(session, title=f"Paper {i}")
        result = registry.list_papers(session)

    assert result["error"] is None
    assert result["truncated"] is True
    assert len(result["data"]["papers"]) == MAX_LIST_PAPERS
    assert result["data"]["indicator"]["total"] == MAX_LIST_PAPERS + 5


def test_list_papers_scoped_to_category(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        cat = _seed_category(session, name="CatA", slug="cat-a")
        _seed_paper(session, title="In CatA", primary_category_id=cat["id"])
        _seed_paper(session, title="Not in Cat")

        result = registry.list_papers(session, scope_type="category", scope_config={"category_id": cat["id"]})

    assert result["error"] is None
    papers = result["data"]["papers"]
    assert len(papers) == 1
    assert papers[0]["title"] == "In CatA"


def test_list_papers_scoped_to_paper_ids(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        p1 = _seed_paper(session, title="Paper1")
        p2 = _seed_paper(session, title="Paper2")
        _seed_paper(session, title="Paper3")

        result = registry.list_papers(session, scope_type="papers", scope_config={"paper_ids": [p1["id"], p2["id"]]})

    assert result["error"] is None
    papers = result["data"]["papers"]
    assert len(papers) == 2
    titles = {p["title"] for p in papers}
    assert titles == {"Paper1", "Paper2"}


# ── get_paper_detail ───────────────────────────────────────

def test_get_paper_detail_excludes_sensitive_fields(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        p = _seed_paper(session, title="Sensitive Test")
        result = registry.get_paper_detail(session, p["id"])

    assert result["error"] is None
    data = result["data"]
    assert "local_pdf_path" not in data
    assert "full_markdown" not in data
    assert "abstract_md" not in data
    assert "source_json" not in data
    assert "api_key" not in data
    assert data["title"] == "Sensitive Test"
    assert data["id"] == p["id"]


def test_get_paper_detail_has_summary(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        p = _seed_paper(
            session,
            title="With Summary",
            summary={"one_line_summary": "测试摘要", "core_contributions": "核心贡献"},
        )
        result = registry.get_paper_detail(session, p["id"])

    assert result["error"] is None
    assert result["data"]["one_line_summary"] == "测试摘要"


def test_get_paper_detail_not_found(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        result = registry.get_paper_detail(session, 99999)

    assert result["error"] is not None
    assert "不存在" in result["error"]


# ── list_categories ───────────────────────────────────────

def test_list_categories_returns_active_with_counts(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        cat = _seed_category(session, name="CatA", slug="cat-a")
        _seed_category(session, name="CatInactive", slug="cat-inactive", is_active=False)
        _seed_paper(session, title="PaperInCatA", primary_category_id=cat["id"])

        result = registry.list_categories(session)

    assert result["error"] is None
    categories = result["data"]
    names = {c["name"] for c in categories}
    assert "CatA" in names
    assert "CatInactive" not in names
    cat_a = next(c for c in categories if c["name"] == "CatA")
    assert cat_a["paper_count"] == 1


# ── list_tags ──────────────────────────────────────────────

def test_list_tags_returns_distinct(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        _seed_paper(session, title="P1", tags_json=json.dumps(["llm", "agent"]))
        _seed_paper(session, title="P2", tags_json=json.dumps(["agent", "vision"]))

        result = registry.list_tags(session)

    assert result["error"] is None
    tags = result["data"]
    assert tags == sorted(["llm", "agent", "vision"])


# ── get_paper_blocks ───────────────────────────────────────

def test_get_paper_blocks_no_source_json(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        p = _seed_paper(
            session,
            title="Blocks Test",
            blocks=[
                {"page_index": 1, "block_index": 0, "block_type": "text",
                 "text": "Hello" * 50, "source_hash": "h1", "source_json": '{"secret": true}'},
                {"page_index": 1, "block_index": 1, "block_type": "title",
                 "text": "Title Text", "source_hash": "h2", "source_json": '{}'},
            ],
        )
        result = registry.get_paper_blocks(session, p["id"])

    assert result["error"] is None
    data = result["data"]
    assert data["total_blocks"] == 2
    for b in data["blocks"]:
        assert "source_json" not in b
        assert "id" in b
        assert "page_index" in b
        assert "block_index" in b
        assert "block_type" in b
        assert "text_preview" in b


def test_get_paper_blocks_truncates_text(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry, MAX_BLOCK_TEXT_LENGTH

    registry = AgentToolRegistry()
    long_text = "X" * (MAX_BLOCK_TEXT_LENGTH + 50)
    with Session(engine) as session:
        p = _seed_paper(
            session,
            title="Long Text",
            blocks=[
                {"page_index": 1, "block_index": 0, "block_type": "text",
                 "text": long_text, "source_hash": "h1", "source_json": "{}"},
            ],
        )
        result = registry.get_paper_blocks(session, p["id"])

    assert result["error"] is None
    preview = result["data"]["blocks"][0]["text_preview"]
    assert len(preview) <= MAX_BLOCK_TEXT_LENGTH + 1  # +1 for "…"
    assert preview.endswith("…")


def test_get_paper_blocks_not_found(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        result = registry.get_paper_blocks(session, 99999)

    assert result["error"] is not None
    assert "不存在" in result["error"]


# ── get_paper_translations ─────────────────────────────────

def test_get_paper_translations_returns_summary(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.models.paper_block import PaperBlock
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        # First create paper, then blocks, then translations
        from app.models.paper import Paper, CategoryStatus
        paper = Paper(
            title="Translation Test", source="manual",
            local_pdf_path="/data/test.pdf",
            status="ready", parse_status="completed", summary_status="completed",
            category_status=CategoryStatus.PENDING_REVIEW,
        )
        session.add(paper)
        session.flush()

        b1 = PaperBlock(paper_id=paper.id, page_index=1, block_index=0,
                        block_type="text", text="Block 1", source_hash="h1")
        b2 = PaperBlock(paper_id=paper.id, page_index=1, block_index=1,
                        block_type="text", text="Block 2", source_hash="h2")
        session.add(b1)
        session.add(b2)
        session.flush()

        from app.models.paper_block_translation import PaperBlockTranslation
        t1 = PaperBlockTranslation(
            paper_id=paper.id, block_id=b1.id, target_language="zh-CN",
            status="completed", translated_text="中文翻译结果",
            source_hash="h1", model_name="gpt-5.4",
        )
        t2 = PaperBlockTranslation(
            paper_id=paper.id, block_id=b2.id, target_language="zh-CN",
            status="failed", translated_text="",
            source_hash="h2", model_name="gpt-5.4",
            error_message="API timeout",
        )
        session.add(t1)
        session.add(t2)
        session.commit()

        result = registry.get_paper_translations(session, paper.id)

    assert result["error"] is None
    data = result["data"]
    assert data["total"] == 2
    assert data["completed"] == 1
    assert data["failed"] == 1


# ── semantic_search ────────────────────────────────────────

def test_semantic_search_empty_query(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        result = registry.semantic_search(session, "")

    assert result["error"] is not None


def test_semantic_search_no_embeddings(client):
    from sqlmodel import Session
    from app.core.db import engine
    from app.services.agent_tool_registry import AgentToolRegistry

    registry = AgentToolRegistry()
    with Session(engine) as session:
        _seed_paper(session, title="No Embed Paper")
        result = registry.semantic_search(session, "search query")

    # No embeddings -> empty results, no error
    assert result["error"] is None
    assert result["data"]["results"] == []


def test_semantic_search_with_embeddings(mocker, client):
    """Test semantic search with mocked embedding to avoid heavy model loading."""
    from sqlmodel import Session
    from app.core.db import engine
    from app.models.paper_embedding import PaperEmbedding
    from app.services.agent_tool_registry import AgentToolRegistry

    # Mock encode to return a deterministic vector
    mock_vec = [0.1] * 8
    mocker.patch("app.services.agent_tool_registry.EmbeddingService.encode", return_value=mock_vec)

    registry = AgentToolRegistry()
    with Session(engine) as session:
        p1 = _seed_paper(session, title="Paper One")
        p2 = _seed_paper(session, title="Paper Two")

        # Create embeddings
        emb1 = PaperEmbedding(paper_id=p1["id"], embedding_json=json.dumps([0.1] * 8))
        emb2 = PaperEmbedding(paper_id=p2["id"], embedding_json=json.dumps([-0.1] * 8))
        session.add(emb1)
        session.add(emb2)
        session.commit()

        result = registry.semantic_search(session, "test query", top_k=5)

    assert result["error"] is None
    results = result["data"]["results"]
    assert len(results) == 2
    assert results[0]["paper_id"] == p1["id"]  # highest similarity
    assert results[0]["similarity"] > results[1]["similarity"]
