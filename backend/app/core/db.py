from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _) -> None:
    if engine.url.drivername != "sqlite":
        return

    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def ensure_sqlite_parent_dir(database_url: str) -> None:
    url = make_url(database_url)
    database_path = url.database

    if url.drivername != "sqlite" or database_path in {None, ":memory:"}:
        return

    Path(database_path).parent.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    ensure_sqlite_parent_dir(settings.database_url)
    SQLModel.metadata.create_all(engine)
    _migrate_add_columns()
    _bootstrap_category_data()


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in rows)


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = :table_name"
        ),
        {"table_name": table},
    ).first()
    return row is not None


def _migrate_add_columns() -> None:
    """Add new columns to existing tables if they don't exist (SQLite safe)."""
    import logging

    logger = logging.getLogger(__name__)
    if engine.url.drivername != "sqlite":
        return
    migrations = [
        ("paper", "tags_json", "TEXT DEFAULT '[]'"),
        ("paper", "primary_category_id", "INTEGER"),
        ("paper", "category_confidence", "REAL DEFAULT 0"),
        ("paper", "category_status", "TEXT DEFAULT 'pending_review'"),
        ("paper", "category_reason", "TEXT DEFAULT ''"),
        ("paper", "year", "INTEGER"),
        ("paper", "venue", "TEXT DEFAULT ''"),
        ("paper", "doi", "TEXT DEFAULT ''"),
        ("paper", "url", "TEXT DEFAULT ''"),
        ("paper", "favorite", "BOOLEAN DEFAULT 0"),
        ("paper", "reading_status", "TEXT DEFAULT 'unread'"),
        ("paper", "reading_progress", "INTEGER DEFAULT 0"),
        ("paper", "user_notes", "TEXT DEFAULT ''"),
        ("subscription", "source_kind", "TEXT DEFAULT 'arxiv'"),
        ("subscription", "display_name", "TEXT DEFAULT ''"),
        ("subscription", "config_json", "TEXT DEFAULT '{}'"),
        ("subscription", "fetch_limit", "INTEGER DEFAULT 10"),
        ("subscription", "last_success_at", "TIMESTAMP"),
        ("subscription", "last_error", "TEXT"),
        ("daily_briefing", "briefing_date", "DATE"),
        ("daily_briefing", "daily_run_id", "INTEGER"),
        ("daily_briefing", "status", "TEXT DEFAULT 'completed'"),
        ("daily_briefing", "top_n", "INTEGER DEFAULT 5"),
        ("daily_briefing", "summary_markdown", "TEXT DEFAULT ''"),
        ("daily_briefing", "paper_count", "INTEGER DEFAULT 0"),
        ("daily_briefing", "project_count", "INTEGER DEFAULT 0"),
        ("daily_briefing", "source_count", "INTEGER DEFAULT 0"),
        ("daily_briefing", "fallback_used", "BOOLEAN DEFAULT 0"),
        ("daily_briefing", "metadata_json", "TEXT DEFAULT '{}'"),
        ("daily_briefing_paper_item", "briefing_id", "INTEGER"),
        ("daily_briefing_paper_item", "rank", "INTEGER DEFAULT 0"),
        ("daily_briefing_paper_item", "score", "REAL DEFAULT 0"),
        ("daily_briefing_paper_item", "reason", "TEXT DEFAULT ''"),
        ("daily_briefing_paper_item", "source_kind", "TEXT DEFAULT ''"),
        ("daily_briefing_project_item", "briefing_id", "INTEGER"),
        ("daily_briefing_project_item", "ingestion_item_id", "INTEGER"),
        ("daily_briefing_project_item", "rank", "INTEGER DEFAULT 0"),
        ("daily_briefing_project_item", "title", "TEXT DEFAULT ''"),
        ("daily_briefing_project_item", "url", "TEXT DEFAULT ''"),
        ("daily_briefing_project_item", "summary", "TEXT DEFAULT ''"),
        ("daily_briefing_project_item", "source_kind", "TEXT DEFAULT ''"),
        ("daily_run", "progress", "INTEGER DEFAULT 0"),
        ("daily_run", "progress_message", "TEXT DEFAULT ''"),
        ("automation_settings", "http_proxy", "TEXT"),
        ("automation_settings", "https_proxy", "TEXT"),
        ("papercontent", "block_extraction_error", "TEXT DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            if not _table_exists(conn, table):
                continue
            if _column_exists(conn, table, column):
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
            logger.info("Migration: added column %s.%s", table, column)

        if _table_exists(conn, "subscription"):
            conn.execute(
                text(
                    """
                    UPDATE subscription
                    SET source_kind = COALESCE(NULLIF(source_kind, ''), type, 'arxiv')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE subscription
                    SET display_name = COALESCE(NULLIF(display_name, ''), name, '')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE subscription
                    SET config_json = '{}'
                    WHERE config_json IS NULL OR TRIM(config_json) = ''
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE subscription
                    SET fetch_limit = 10
                    WHERE fetch_limit IS NULL OR fetch_limit < 1
                    """
                )
            )
            conn.commit()

        if _table_exists(conn, "daily_briefing"):
            if _column_exists(conn, "daily_briefing", "briefing_date") and _column_exists(conn, "daily_briefing", "run_date"):
                conn.execute(
                    text(
                        """
                        UPDATE daily_briefing
                        SET briefing_date = COALESCE(briefing_date, run_date)
                        WHERE briefing_date IS NULL
                        """
                    )
                )
            conn.commit()

        if _table_exists(conn, "daily_briefing_paper_item"):
            conn.execute(
                text(
                    """
                    UPDATE daily_briefing_paper_item
                    SET briefing_id = COALESCE(briefing_id, daily_briefing_id),
                        rank = CASE WHEN rank IS NULL OR rank = 0 THEN COALESCE(rank_order, 0) ELSE rank END
                    """
                )
            )
            conn.commit()

        if _table_exists(conn, "daily_briefing_project_item"):
            conn.execute(
                text(
                    """
                    UPDATE daily_briefing_project_item
                    SET briefing_id = COALESCE(briefing_id, daily_briefing_id),
                        rank = CASE WHEN rank IS NULL OR rank = 0 THEN COALESCE(sort_order, 0) ELSE rank END,
                        title = COALESCE(NULLIF(title, ''), project_name, ''),
                        summary = COALESCE(NULLIF(summary, ''), note, ''),
                        source_kind = COALESCE(source_kind, '')
                    """
                )
            )
            conn.commit()


def _bootstrap_category_data() -> None:
    from app.services.category_service import backfill_uncategorized_papers, ensure_default_categories

    with Session(engine) as session:
        ensure_default_categories(session)
        backfill_uncategorized_papers(session)


def get_session():
    with Session(engine) as session:
        yield session
