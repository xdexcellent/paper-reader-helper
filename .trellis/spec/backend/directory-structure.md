# Directory Structure

> How backend code is organized in this project.

---

## Overview

The backend is a FastAPI monolith under `backend/app/`. It is organized by technical layer rather than by large feature folders:

- `api/routes/` contains HTTP endpoints
- `services/` contains business logic, external API clients, schedulers, and background task helpers
- `models/` contains SQLModel persistence models
- `schemas/` contains request/response schemas used by route handlers
- `core/` contains app configuration, auth, and database bootstrap

This project is not split into microservices. New backend work should usually fit into the existing monolith structure.

---

## Directory Layout

```text
backend/
├── app/
│   ├── api/
│   │   └── routes/
│   ├── core/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   │   └── source_adapters/
│   └── main.py
├── tests/
└── pyproject.toml
```

More concrete examples from this repo:

- `backend/app/main.py` wires routers, auth protection, startup DB init, static file mount, and scheduler startup.
- `backend/app/api/routes/papers.py` contains paper CRUD, upload/import, semantic search, and task-triggering endpoints.
- `backend/app/services/pipeline.py` contains parse, summarize, embedding, tagging, and category orchestration.
- `backend/app/services/source_adapters/` contains adapters for external sources such as arXiv, RSS, OpenReview, Hugging Face Papers, and GitHub Trending.

---

## Module Organization

When adding new backend behavior, follow these rules:

1. Put HTTP concerns in `api/routes/`.
   - Request parsing
   - `HTTPException`
   - endpoint-level status codes
   - dependency injection with `Depends`

2. Put domain and integration logic in `services/`.
   - external API calls
   - task orchestration
   - file storage
   - classification/tagging/summarization logic

3. Put persisted data shape in `models/`.
   - SQLModel tables
   - default values
   - lightweight helper properties for JSON-backed fields

4. Put request/response contracts in `schemas/` when the payload is not the raw model.

5. Keep `main.py` as composition root.
   - router registration
   - startup/shutdown lifecycle
   - middleware
   - static mounts

Good examples:

- Route → service split: `backend/app/api/routes/papers.py` + `backend/app/services/pipeline.py`
- Storage isolated from routes: `backend/app/services/storage.py`
- Scheduler isolated from app startup: `backend/app/services/automation_scheduler.py`

---

## Naming Conventions

Observed naming conventions in this project:

- Route files are plural or feature-based: `papers.py`, `chat.py`, `stats.py`, `briefing.py`.
- Service files are capability-based: `pipeline.py`, `storage.py`, `embedding_service.py`, `daily_ingestion.py`.
- Model files are singular nouns: `paper.py`, `subscription.py`, `daily_briefing.py`.
- Schema files generally mirror the domain object: `paper.py`, `category.py`, etc.
- Constants are usually uppercase module globals, for example `_POLL_TIMEOUT` in `backend/app/services/mineru_client.py`.
- Status values are plain strings centralized in lightweight classes, for example `PaperStatus`, `PipelineStatus`, and `CategoryStatus` in `backend/app/models/paper.py`.

Prefer extending the existing naming style instead of introducing new suffixes like `manager`, `processor`, or `handler` unless the file is genuinely that kind of abstraction.

---

## Examples

Well-aligned examples in the current codebase:

1. `backend/app/main.py`
   - clear composition root
   - imports routers and models explicitly
   - keeps runtime wiring out of route files

2. `backend/app/services/task_queue.py`
   - self-contained infrastructure helper
   - no HTTP knowledge
   - focused on in-process background execution

3. `backend/app/services/storage.py`
   - single responsibility for local file import/storage
   - routes call it instead of duplicating filesystem logic

---

## Anti-Patterns To Avoid

- Putting external API calls directly inside route handlers.
  - Why: it makes endpoints hard to test and mixes transport with business logic.
- Putting SQLModel persistence logic in frontend-facing schemas.
  - Why: models and API contracts evolve differently.
- Adding a new directory layer without a clear need.
  - Why: this codebase currently favors a simple monolith layout.
- Duplicating storage or task-queue logic inside multiple routes.
  - Why: `storage.py` and `task_queue.py` already centralize that behavior.

---

## Common Mistakes

- Growing route files too large instead of pushing reusable logic into `services/`.
- Adding new behavior to already-large service files without extracting smaller helpers.
- Mixing persistence updates, external API calls, and HTTP response shaping in one function.
- Forgetting that this project is monolith-first and local-storage-first; avoid overengineering distributed patterns that do not exist here.
