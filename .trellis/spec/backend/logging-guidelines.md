# Logging Guidelines

> How logging is done in this project.

---

## Overview

The backend uses Python's standard `logging` module with module-level loggers:

```python
logger = logging.getLogger(__name__)
```

There is no centralized `dictConfig`, JSON logger, or structured logging framework yet. Logging is currently lightweight and message-oriented.

Examples:

- `backend/app/services/pipeline.py`
- `backend/app/services/daily_ingestion.py`
- `backend/app/api/routes/papers.py`
- `backend/app/services/task_queue.py`

---

## Log Levels

Observed level usage in this project:

- `logger.info(...)`
  - successful milestones
  - migration progress
  - automatic tagging/classification success
  - task submission/completion details
- `logger.warning(...)`
  - degraded but recoverable situations
  - missing configuration
  - skipped auto-tag/classification
  - stale runtime state recovery
- `logger.exception(...)`
  - unexpected failures with stack traces
  - external API failures
  - background task failures

Use `logger.exception(...)` inside `except` blocks when the traceback matters. Use `warning` for recoverable situations that still need visibility.

---

## Structured Logging

Current reality:

- logs are plain text, not structured JSON
- important identifiers are embedded in the message string
- the most common identifier is `paper.id`
- task IDs are logged in queue/integration code when relevant

Examples:

- `backend/app/services/pipeline.py`
  - `logger.info("Embedding generated for paper %s (%d dims)", paper.id, len(vector))`
- `backend/app/api/routes/papers.py`
  - stale task recovery logs include task type and paper id
- `backend/app/services/task_queue.py`
  - background task failure logs include task id

Recommended pattern for this repo:

- include the entity id in the message
- keep messages short and searchable
- prefer `%s` formatting via logger arguments instead of f-strings inside logger calls

---

## What to Log

Log these events consistently:

- background job submission/failure/completion
- pipeline state transitions that help explain UI-visible progress
- automatic recovery from stale processing states
- schema migration actions during startup
- external API failures that affect parsing, summarization, ingestion, or embeddings
- scheduler and automation lifecycle events

Good examples:

- `backend/app/core/db.py`
- `backend/app/services/pipeline.py`
- `backend/app/services/task_queue.py`
- `backend/app/services/daily_ingestion.py`

---

## What NOT to Log

Do not log:

- API keys, JWT secrets, passwords, or raw auth tokens
- full request/response bodies from external providers unless carefully sanitized
- raw PDF file contents or large markdown payloads
- user-sensitive local file paths if a shorter identifier is enough

This matters because the app handles local files, auth, and third-party API integrations.

---

## Common Mistakes

- Leaving `print(...)` debug statements in service clients.
  - Current examples still exist in `backend/app/services/deepseek_client.py` and `backend/app/services/mineru_client.py` and should be treated as cleanup targets, not patterns to copy.
- Logging success without logging the corresponding failure path.
- Logging messages without paper/task identifiers.
- Logging large payloads that make troubleshooting harder instead of easier.

---

## Anti-Patterns To Avoid

- Mixing `print(...)` and `logger.*(...)` in the same code path.
- Logging secrets or token-bearing headers.
- Adding a heavy structured logging stack unless the project actually needs it.
- Using logs instead of durable status fields for UI-critical state.
