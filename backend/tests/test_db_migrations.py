from sqlalchemy import text
from sqlmodel import create_engine

import app.core.db as db_module


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
