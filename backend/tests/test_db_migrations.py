from pathlib import Path

import pytest
from sqlalchemy import text
from sqlmodel import SQLModel, Session, create_engine

import app.core.db as db_module
from app.models.agent_action import AgentAction  # noqa: F401
from app.models.agent_run import AgentRun  # noqa: F401
from app.models.agent_tool_event import AgentToolEvent  # noqa: F401
from app.models.paper import Paper  # noqa: F401
from app.models.paper_block import PaperBlock  # noqa: F401
from app.models.paper_block_translation import PaperBlockTranslation  # noqa: F401
from app.models.zotero_import_candidate import ZoteroImportCandidate  # noqa: F401
from app.models.zotero_import_run import ZoteroImportRun  # noqa: F401


def test_migrate_add_columns_backfills_legacy_subscription_table(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_subscription.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE subscription (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    query TEXT NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    last_checked_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO subscription (
                    id,
                    name,
                    type,
                    query,
                    is_active,
                    last_checked_at,
                    created_at
                ) VALUES (
                    1,
                    'Vision Daily',
                    'arxiv',
                    'cat:cs.CV',
                    1,
                    NULL,
                    '2026-04-19 00:00:00'
                )
                """
            )
        )

    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(subscription)"))
        }
        row = conn.execute(
            text(
                """
                SELECT
                    source_kind,
                    display_name,
                    config_json,
                    fetch_limit,
                    last_success_at,
                    last_error
                FROM subscription
                WHERE id = 1
                """
            )
        ).one()

    assert "source_kind" in columns
    assert "display_name" in columns
    assert "config_json" in columns
    assert "fetch_limit" in columns
    assert "last_success_at" in columns
    assert "last_error" in columns
    assert row.source_kind == "arxiv"
    assert row.display_name == "Vision Daily"
    assert row.config_json == "{}"
    assert row.fetch_limit == 10
    assert row.last_success_at is None
    assert row.last_error is None


def test_migrate_add_columns_upgrades_legacy_automation_settings_table(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_automation_settings.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE automation_settings (
                    id INTEGER PRIMARY KEY,
                    enabled BOOLEAN NOT NULL DEFAULT 1,
                    schedule_time TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    top_n INTEGER NOT NULL DEFAULT 5,
                    briefing_enabled BOOLEAN NOT NULL DEFAULT 1,
                    project_sidebar_enabled BOOLEAN NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO automation_settings (
                    id,
                    enabled,
                    schedule_time,
                    timezone,
                    top_n,
                    briefing_enabled,
                    project_sidebar_enabled,
                    created_at,
                    updated_at
                ) VALUES (
                    1,
                    1,
                    '12:00',
                    'Asia/Shanghai',
                    5,
                    1,
                    1,
                    '2026-04-19 00:00:00',
                    '2026-04-19 00:00:00'
                )
                """
            )
        )

    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(automation_settings)"))
        }
        row = conn.execute(
            text(
                """
                SELECT
                    http_proxy,
                    https_proxy
                FROM automation_settings
                WHERE id = 1
                """
            )
        ).one()

    assert "http_proxy" in columns
    assert "https_proxy" in columns
    assert row.http_proxy is None
    assert row.https_proxy is None


def test_migrate_add_columns_upgrades_legacy_paper_table_for_reader_metadata(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_paper_reader_metadata.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE paper (
                    id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    local_pdf_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    parse_status TEXT NOT NULL,
                    summary_status TEXT NOT NULL,
                    embedding_status TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO paper (
                    id,
                    source,
                    title,
                    local_pdf_path,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status,
                    created_at,
                    updated_at
                ) VALUES (
                    1,
                    'manual',
                    'Legacy Paper',
                    '/tmp/legacy.pdf',
                    'queued',
                    'pending',
                    'pending',
                    'pending',
                    '2026-05-03 00:00:00',
                    '2026-05-03 00:00:00'
                )
                """
            )
        )

    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(paper)"))
        }
        row = conn.execute(
            text(
                """
                SELECT
                    year,
                    venue,
                    venue_resolution_status,
                    venue_resolution_note,
                    doi,
                    url,
                    favorite,
                    reading_status,
                    reading_progress,
                    user_notes,
                    representative_image_path
                FROM paper
                WHERE id = 1
                """
            )
        ).one()

    assert "year" in columns
    assert "venue" in columns
    assert "venue_resolution_status" in columns
    assert "venue_resolution_note" in columns
    assert "doi" in columns
    assert "url" in columns
    assert "favorite" in columns
    assert "reading_status" in columns
    assert "reading_progress" in columns
    assert "user_notes" in columns
    assert "representative_image_path" in columns
    assert row.year is None
    assert row.venue == ""
    assert row.venue_resolution_status == "pending"
    assert row.venue_resolution_note == ""
    assert row.doi == ""
    assert row.url == ""
    assert row.favorite == 0
    assert row.reading_status == "unread"
    assert row.reading_progress == 0
    assert row.user_notes == ""
    assert row.representative_image_path == ""


def test_migrate_add_columns_marks_existing_venue_as_resolved(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_paper_venue_resolution.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE paper (
                    id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    local_pdf_path TEXT NOT NULL,
                    venue TEXT DEFAULT '',
                    status TEXT NOT NULL,
                    parse_status TEXT NOT NULL,
                    summary_status TEXT NOT NULL,
                    embedding_status TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO paper (
                    id,
                    source,
                    title,
                    local_pdf_path,
                    venue,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status,
                    created_at,
                    updated_at
                ) VALUES (
                    1,
                    'manual',
                    'Legacy With Venue',
                    '/tmp/legacy.pdf',
                    'ICCV',
                    'queued',
                    'pending',
                    'pending',
                    'pending',
                    '2026-05-03 00:00:00',
                    '2026-05-03 00:00:00'
                )
                """
            )
        )

    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT venue_resolution_status, venue_resolution_note FROM paper WHERE id = 1"
            )
        ).one()

    assert row.venue_resolution_status == "resolved"
    assert row.venue_resolution_note == ""


def test_init_schema_creates_phase3_block_tables_without_rewriting_legacy_papers(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_phase3_blocks.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE paper (
                    id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    local_pdf_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    parse_status TEXT NOT NULL,
                    summary_status TEXT NOT NULL,
                    embedding_status TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO paper (
                    id,
                    source,
                    title,
                    local_pdf_path,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status,
                    created_at,
                    updated_at
                ) VALUES (
                    1,
                    'manual',
                    'Legacy Blocks Paper',
                    '/tmp/legacy-blocks.pdf',
                    'parsed',
                    'completed',
                    'pending',
                    'pending',
                    '2026-05-06 00:00:00',
                    '2026-05-06 00:00:00'
                )
                """
            )
        )

    SQLModel.metadata.create_all(test_engine)
    db_module._migrate_add_columns()
    SQLModel.metadata.create_all(test_engine)
    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        tables = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type = 'table'")
            )
        }
        block_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(paperblock)"))
        }
        translation_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(paperblocktranslation)"))
        }
        paper_row = conn.execute(
            text(
                """
                SELECT
                    source,
                    title,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status,
                    favorite,
                    reading_status,
                    reading_progress
                FROM paper
                WHERE id = 1
                """
            )
        ).one()

    assert "paperblock" in tables
    assert "paperblocktranslation" in tables
    assert {
        "id",
        "paper_id",
        "page_index",
        "block_index",
        "block_type",
        "text",
        "bbox_json",
        "asset_path",
        "source_hash",
        "source_json",
        "created_at",
        "updated_at",
    }.issubset(block_columns)
    assert {
        "id",
        "paper_id",
        "block_id",
        "target_language",
        "model_name",
        "prompt_version",
        "source_hash",
        "translated_text",
        "status",
        "error_message",
        "created_at",
        "updated_at",
    }.issubset(translation_columns)
    assert paper_row.source == "manual"
    assert paper_row.title == "Legacy Blocks Paper"
    assert paper_row.status == "parsed"
    assert paper_row.parse_status == "completed"
    assert paper_row.summary_status == "pending"
    assert paper_row.embedding_status == "pending"
    assert paper_row.favorite == 0
    assert paper_row.reading_status == "unread"
    assert paper_row.reading_progress == 0


def test_init_schema_creates_phase4_agent_zotero_tables_without_rewriting_legacy_papers(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy_phase4_agent_zotero.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(db_module, "engine", test_engine)

    with test_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE paper (
                    id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    local_pdf_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    parse_status TEXT NOT NULL,
                    summary_status TEXT NOT NULL,
                    embedding_status TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO paper (
                    id,
                    source,
                    title,
                    local_pdf_path,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status,
                    created_at,
                    updated_at
                ) VALUES (
                    1,
                    'manual',
                    'Phase 4 Legacy Paper',
                    '/tmp/phase4-legacy.pdf',
                    'ready',
                    'completed',
                    'completed',
                    'completed',
                    '2026-05-06 00:00:00',
                    '2026-05-06 00:00:00'
                )
                """
            )
        )

    SQLModel.metadata.create_all(test_engine)
    db_module._migrate_add_columns()
    SQLModel.metadata.create_all(test_engine)
    db_module._migrate_add_columns()

    with test_engine.connect() as conn:
        tables = {
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type = 'table'")
            )
        }
        agent_run_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(agentrun)"))
        }
        agent_tool_event_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(agenttoolevent)"))
        }
        agent_action_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(agentaction)"))
        }
        zotero_import_run_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(zoteroimportrun)"))
        }
        zotero_import_candidate_columns = {
            row[1]: row[2]
            for row in conn.execute(text("PRAGMA table_info(zoteroimportcandidate)"))
        }
        paper_row = conn.execute(
            text(
                """
                SELECT
                    source,
                    title,
                    status,
                    parse_status,
                    summary_status,
                    embedding_status
                FROM paper
                WHERE id = 1
                """
            )
        ).one()

    assert "agentrun" in tables
    assert "agenttoolevent" in tables
    assert "agentaction" in tables
    assert "zoteroimportrun" in tables
    assert "zoteroimportcandidate" in tables

    assert {
        "id", "prompt", "scope_type", "scope_config_json", "model",
        "status", "chat_session_id", "created_at", "updated_at",
    }.issubset(agent_run_columns)
    assert {
        "id", "agent_run_id", "tool_name", "input_summary", "output_summary",
        "status", "error_message", "created_at",
    }.issubset(agent_tool_event_columns)
    assert {
        "id", "agent_run_id", "action_type", "target_paper_id", "target_category_id",
        "before_values_json", "after_values_json", "rationale", "confidence",
        "risk_level", "status", "revert_action_id", "rejection_reason",
        "error_message", "created_at", "updated_at",
    }.issubset(agent_action_columns)
    assert {
        "id", "source_fingerprint", "status", "imported_count", "skipped_count",
        "duplicate_count", "warning_count", "failed_count", "error_message",
        "created_at", "updated_at",
    }.issubset(zotero_import_run_columns)
    assert {
        "id", "import_run_id", "source_key", "zotero_item_type", "raw_title",
        "mapped_title", "mapped_authors", "mapped_year", "mapped_doi",
        "mapped_url", "mapped_venue", "mapped_abstract_note",
        "mapped_publication_title", "mapped_collections_json", "mapped_tags_json",
        "attachment_path", "attachment_exists", "is_duplicate",
        "duplicate_of_paper_id", "duplicate_reason", "is_selected",
        "warning_message", "import_status", "imported_paper_id",
        "import_error", "created_at",
    }.issubset(zotero_import_candidate_columns)
    assert paper_row.source == "manual"
    assert paper_row.title == "Phase 4 Legacy Paper"
    assert paper_row.status == "ready"
    assert paper_row.parse_status == "completed"
    assert paper_row.summary_status == "completed"
    assert paper_row.embedding_status == "completed"
