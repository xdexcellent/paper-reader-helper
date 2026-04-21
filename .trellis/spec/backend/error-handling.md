# Error Handling

> How errors are handled in this project.

---

## Overview

Backend error handling is pragmatic and layer-specific:

- Route handlers translate user-facing failures into `HTTPException`
- Services log exceptions and usually re-raise them
- Long-running pipeline flows update DB status fields before re-raising
- Frontend-facing messages are usually human-readable Chinese strings

There is no global custom error hierarchy yet. Most code uses built-in exceptions plus `HTTPException`.

---

## Error Types

The current project mainly uses these error categories:

1. `HTTPException` in route handlers
   - Examples: invalid password, invalid file type, PDF download failure
   - See `backend/app/api/routes/auth.py` and `backend/app/api/routes/papers.py`

2. Runtime/integration exceptions in services
   - Examples: MinerU API failures, DeepSeek failures, embedding failures
   - See `backend/app/services/mineru_client.py` and `backend/app/services/deepseek_client.py`

3. Persistence or filesystem exceptions
   - Examples: failed commit, missing file, permission errors, cleanup failures
   - See `backend/app/api/routes/papers.py` and `backend/app/services/storage.py`

4. Background task failures recorded in queue state
   - See `backend/app/services/task_queue.py`

There are no widely used custom exception classes yet. If you add one, use it because it improves clarity across multiple call sites, not just for style.

---

## Error Handling Patterns

### Route layer

Use `HTTPException` for request validation and user-facing API failures.

Examples:

- `backend/app/api/routes/auth.py`
  - invalid password returns `401`
  - token configuration failures return `500`
- `backend/app/api/routes/papers.py`
  - bad file/path input returns `400`
  - duplicate active task returns `409`

### Service layer

Services usually:

1. set the object into a processing state
2. attempt the external/integration work
3. on failure, log with `logger.exception(...)`
4. update durable status fields to `failed`
5. re-raise the exception

Good example:

- `backend/app/services/pipeline.py`
  - `parse_paper()` and `summarize_paper()` both update status fields before re-raising

### Degraded behavior vs hard failure

The project mixes both patterns:

- DeepSeek summary generation falls back to placeholder content when the API key is missing or the API call fails: `backend/app/services/deepseek_client.py`
- MinerU parsing fails explicitly and asks for valid configuration instead of silently pretending parsing succeeded: `backend/app/services/mineru_client.py`

When adding new behavior, choose fallback only if the degraded output is still honest and useful.

---

## API Error Responses

Observed response shape:

- Most failures return FastAPI's default format: `{ "detail": "...message..." }`
- The frontend expects `detail` and extracts it centrally in `frontend/src/lib/api.ts`
- For unauthorized responses, the frontend dispatches a shared `UNAUTHORIZED_EVENT`

This means backend changes should preserve clear `detail` messages unless there is a strong reason to introduce a new error envelope.

Examples:

- `backend/app/api/routes/auth.py`
- `backend/app/api/routes/papers.py`
- `frontend/src/lib/api.ts`

---

## Common Mistakes

- Catching exceptions and hiding the real cause without logging.
- Failing to update `status`, `parse_status`, `summary_status`, or `embedding_status` when background work fails.
- Returning vague English-only backend messages when the rest of the app uses Chinese user-facing feedback.
- Swallowing exceptions in integration code and making the UI look successful.
- Not rolling back or cleaning up files after a failed import/commit sequence.

---

## Anti-Patterns To Avoid

- Silent `except Exception: pass` in backend flows.
- Pretending external API work succeeded when no real result exists.
- Introducing a custom error abstraction everywhere before the codebase actually needs it.
- Returning inconsistent API error formats that break `frontend/src/lib/api.ts`.

---

## Examples

- `backend/app/services/pipeline.py`
  - durable status transitions on failure
- `backend/app/api/routes/papers.py`
  - translates filesystem/download failures into HTTP responses
- `backend/tests/test_auth.py`
  - verifies auth error paths
- `backend/tests/test_parse_pipeline.py`
  - verifies stale/failed pipeline state recovery
