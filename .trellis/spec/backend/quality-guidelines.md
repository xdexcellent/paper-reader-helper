# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend quality in this project is driven more by code shape and tests than by a heavy lint/type-check toolchain.

Current tooling:

- Python >= 3.12: `backend/pyproject.toml`
- FastAPI + SQLModel backend
- `pytest` and `pytest-mock` for tests: `backend/pyproject.toml`
- tests live under `backend/tests/`

There is no committed Ruff/mypy configuration yet, so keep code straightforward and consistent with the existing style.

---

## Forbidden Patterns

Do not introduce these patterns:

- Business logic directly inside route handlers when it should live in `services/`
- Silent exception swallowing
- Fake-success fallbacks for operations that must produce real output
- Destructive filesystem work without cleanup on failure
- Database changes that are not covered by idempotent startup migration logic
- New background-processing infrastructure when the existing in-process queue is sufficient

Current examples of rough edges that should not be copied:

- `print(...)` debugging in `backend/app/services/deepseek_client.py`
- `print(...)` debugging in `backend/app/services/mineru_client.py`
- unreachable fallback code after `raise` in `backend/app/services/mineru_client.py`

---

## Required Patterns

Prefer these patterns:

- Keep routes thin and service-oriented.
- Update durable pipeline state fields when background work starts, succeeds, or fails.
- Use `logger.exception(...)` for unexpected failures in service code.
- Roll back DB changes and clean up files on partial failure.
- Reuse existing helpers such as `StorageService`, `BackgroundTaskQueue`, and `PaperPipelineService` instead of duplicating logic.
- Keep the monolith simple; favor extension of existing modules over adding new architectural layers.

Examples to follow:

- `backend/app/services/storage.py`
- `backend/app/services/task_queue.py`
- `backend/app/services/pipeline.py`
- `backend/app/api/routes/papers.py`

---

## Testing Requirements

Backend changes should usually be covered by `pytest` tests under `backend/tests/`.

Observed test focus in this repo:

- auth behavior: `backend/tests/test_auth.py`
- route-level behavior: `backend/tests/test_import_paper.py`, `backend/tests/test_upload_paper.py`
- pipeline execution and stale-state recovery: `backend/tests/test_parse_pipeline.py`, `backend/tests/test_summarize_pipeline.py`
- migration safety: `backend/tests/test_db_migrations.py`
- integrations/adapters/scheduler: `backend/tests/test_source_adapters.py`, `backend/tests/test_automation_scheduler.py`

Expectations:

- Add or update tests for non-trivial route behavior.
- Add regression tests for migration logic.
- Add pipeline/task-state tests when changing async processing flows.
- Mock third-party providers in tests unless the test specifically targets the integration wrapper behavior.

---

## Code Review Checklist

Reviewers should check:

- Is HTTP logic separated from service logic?
- Does the code preserve SQLite-first compatibility?
- Are pipeline status fields updated consistently?
- Are file operations cleaned up on failure?
- Does the change reuse existing helpers before adding new abstractions?
- Is there a test for the new behavior or regression?
- Are logs useful without leaking secrets?
- Did the change accidentally introduce distributed-system complexity the app does not use?

---

## Common Mistakes

- Making route handlers too large.
- Forgetting to commit status changes before background work proceeds.
- Treating local-first development like a cloud-native distributed system.
- Adding a second implementation path instead of extending the current service.
- Making manual migrations without regression tests.
