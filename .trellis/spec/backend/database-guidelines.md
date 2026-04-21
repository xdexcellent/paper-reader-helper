# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

This project uses:

- `SQLModel` for ORM models and sessions
- SQLite as the default database
- startup-time schema creation with `SQLModel.metadata.create_all(engine)`
- hand-written SQLite-safe migrations in Python instead of Alembic

The database bootstrap lives in `backend/app/core/db.py`.

This is a pragmatic local-first setup. Do not assume Postgres features, distributed transactions, or a migration framework.

---

## Query Patterns

Observed query patterns:

- Open a session with `Session(engine)` or inject one with `Depends(get_session)`.
- Use `session.get(Model, id)` for primary-key lookups.
- Use `select(...)` with `session.exec(...)` for filtered queries.
- Persist changes with `session.add(...)`, `session.commit()`, and `session.refresh(...)`.
- Roll back explicitly when a multi-step flow can leave filesystem side effects behind.

Examples:

- `backend/app/core/db.py`
  - provides `get_session()` and database bootstrap
- `backend/app/api/routes/papers.py`
  - uses injected `Session` in route handlers
  - rolls back DB work and cleans up files on import failures
- `backend/app/services/pipeline.py`
  - updates pipeline status fields incrementally and commits after important state transitions

Practical guidance:

- Commit after meaningful state changes when background processing needs durable progress.
- Refresh models after commit if later logic depends on DB-generated values.
- Keep query logic readable; this repo does not use a repository layer.

---

## Migrations

Migrations are manual and live in `backend/app/core/db.py`.

Current pattern:

1. Create tables with `SQLModel.metadata.create_all(engine)`.
2. Run explicit migration helpers such as `_migrate_add_columns()`.
3. Use SQLite-safe checks before mutating schema.
4. Backfill legacy rows immediately after adding columns.

Examples:

- `backend/app/core/db.py:32`
  - `init_db()` creates tables and runs follow-up bootstrap logic
- `backend/app/core/db.py:54`
  - `_migrate_add_columns()` checks for table/column existence before `ALTER TABLE`
- `backend/tests/test_db_migrations.py`
  - verifies legacy subscription tables are backfilled correctly

Rules for new migrations:

- Make migrations idempotent.
- Guard every schema change with existence checks.
- Prefer additive changes over destructive rewrites.
- Add a regression test in `backend/tests/` for non-trivial migration logic.

---

## Naming Conventions

Observed conventions:

- Table names are singular by default unless explicitly overridden by `__tablename__`.
  - Example: `Paper` maps to `paper`; `Subscription` explicitly sets `__tablename__ = "subscription"`.
- Foreign keys use `<entity>_id`.
  - Examples: `primary_category_id`, `paper_id`, `briefing_id`
- Timestamp fields end with `_at`.
  - Examples: `created_at`, `updated_at`, `last_success_at`
- JSON-like payloads stored in text columns end with `_json`.
  - Examples: `tags_json`, `config_json`, `embedding_json`
- Status fields are plain string columns rather than DB enums.
  - Examples: `status`, `parse_status`, `summary_status`, `category_status`

Keep following these conventions instead of introducing mixed naming styles.

---

## Common Mistakes

- Assuming Alembic exists.
  - It does not; migration logic is currently manual.
- Assuming normalized tables exist for every structured field.
  - Several fields intentionally use JSON stored in text columns.
- Forgetting to `rollback()` when DB writes and filesystem writes happen in the same flow.
  - See the cleanup logic in `backend/app/api/routes/papers.py` and `backend/app/services/storage.py`.
- Writing migration code that is not SQLite-safe.
  - This project boots on SQLite and must stay compatible.
- Hiding status transitions inside a giant transaction.
  - The pipeline currently commits intermediate progress so the UI can observe durable state changes.

---

## Anti-Patterns To Avoid

- Adding raw SQL everywhere when SQLModel/SQLAlchemy already covers the query.
- Using destructive schema changes during startup without existence checks.
- Storing secrets or large opaque blobs in database text columns unless there is a strong reason.
- Introducing database-specific SQL that breaks SQLite-first development.
