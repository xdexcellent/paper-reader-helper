# PaperQuay Phase 4 Agent and Zotero Implementation Handoff Plan

> **Draft status:** This is a handoff plan for other AI models. It is not the formal spec-workflow `tasks.md`. Formal `design.md` and `tasks.md` must be generated after `requirements.md` is approved through spec-workflow.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Each task must start by running `spec-workflow-guide`, reading this spec folder, marking the formal task in progress when a formal `tasks.md` exists, and logging implementation with `log_implementation`.

**Goal:** Implement PaperQuay PRD Phase 4 by adding a controlled library Agent workspace and read-only Zotero import flow.

**Architecture:** Keep the existing FastAPI + SQLModel + SQLite + React/Vite stack. Add new Agent and Zotero route/service/model modules instead of expanding `papers.py`. Use existing authenticated route protection, task queue, paper/category update behavior, and frontend `api.ts` wrapper pattern.

**Tech Stack:** FastAPI, SQLModel, SQLite, Pydantic, React 18, Vite, Vitest, Testing Library, existing in-process task queue.

---

## Scope Boundaries

- In scope: Agent read-only tools, Agent proposal storage, human confirmation, approved metadata/tag/category/read-state writes, audit trail, safe revert for scalar/tag/category operations, Zotero read-only scan, Zotero preview, dedupe, confirmed import, import audit.
- Out of scope: deleting papers/files, modifying original Zotero DB, source-level PaperQuay code reuse, Tauri/Rust migration, background cloud sync, collaborative permissions, Zotero two-way sync, automatic full-library destructive edits.
- License boundary: treat PaperQuay as product reference only. Do not copy AGPL source code.

## File Map

### Backend Agent

- Create `backend/app/models/agent_run.py`: durable Agent run metadata.
- Create `backend/app/models/agent_tool_event.py`: bounded tool trace events.
- Create `backend/app/models/agent_action.py`: proposed/approved/executed/rejected action records.
- Create `backend/app/schemas/agent.py`: API request/response contracts.
- Create `backend/app/services/agent_tool_registry.py`: read-only library tool definitions.
- Create `backend/app/services/agent_proposal_service.py`: validate/store proposals and execute approved actions.
- Create `backend/app/services/agent_runner_service.py`: compose model prompt, call model, parse/validate proposals.
- Create `backend/app/api/routes/agent.py`: authenticated Agent endpoints.
- Modify `backend/app/models/__init__.py` and `backend/app/main.py`: metadata import and router registration.
- Modify `backend/tests/test_db_migrations.py`: additive model creation coverage.
- Create `backend/tests/test_agent_tool_registry.py`, `backend/tests/test_agent_proposal_service.py`, `backend/tests/test_agent_api.py`.

### Backend Zotero

- Create `backend/app/models/zotero_import_run.py`: import run metadata.
- Create `backend/app/models/zotero_import_candidate.py`: scanned candidate, dedupe state, selected state, result state.
- Create `backend/app/schemas/zotero.py`: scan/preview/import contracts.
- Create `backend/app/services/zotero_source_service.py`: source validation, copy-to-temp, read-only SQLite connection.
- Create `backend/app/services/zotero_mapping_service.py`: item/creator/tag/collection/attachment mapping.
- Create `backend/app/services/zotero_import_service.py`: preview, dedupe, confirmed import, per-candidate failures.
- Create `backend/app/api/routes/zotero.py`: authenticated Zotero endpoints.
- Modify `backend/app/models/__init__.py` and `backend/app/main.py`: metadata import and router registration.
- Create `backend/tests/fixtures/zotero_sample.sqlite` or fixture builder utility.
- Create `backend/tests/test_zotero_source_service.py`, `backend/tests/test_zotero_mapping_service.py`, `backend/tests/test_zotero_import_api.py`.

### Frontend

- Modify `frontend/src/types.ts`: Agent and Zotero typed contracts.
- Modify `frontend/src/lib/api.ts` and `frontend/src/lib/api.test.ts`: wrappers and request-shape tests.
- Create `frontend/src/components/agent/AgentWorkspace.tsx`.
- Create `frontend/src/components/agent/AgentScopePicker.tsx`.
- Create `frontend/src/components/agent/AgentTracePanel.tsx`.
- Create `frontend/src/components/agent/AgentProposalList.tsx`.
- Create `frontend/src/components/agent/agentUtils.ts` and `agentUtils.test.ts`.
- Create `frontend/src/components/zotero/ZoteroImportPage.tsx`.
- Create `frontend/src/components/zotero/ZoteroSourceForm.tsx`.
- Create `frontend/src/components/zotero/ZoteroCandidateTable.tsx`.
- Create `frontend/src/components/zotero/ZoteroImportSummary.tsx`.
- Create `frontend/src/components/zotero/zoteroUtils.ts` and `zoteroUtils.test.ts`.
- Modify `frontend/src/App.tsx`: add routes/navigation for Agent and Zotero import if product owner approves route naming.
- Modify `frontend/src/App.test.tsx`: route-level integration coverage.
- Modify `frontend/src/index.css`: data-dense, responsive Agent/Zotero workspace styling.

## Proposed API Surface

### Agent

- `POST /agent/runs`: create an Agent run and return run detail with trace/proposals.
- `GET /agent/runs`: list recent Agent runs.
- `GET /agent/runs/{run_id}`: get run, trace, proposals, and execution summary.
- `POST /agent/actions/{action_id}/approve`: approve and execute one proposal.
- `POST /agent/runs/{run_id}/approve-batch`: approve a safe batch after final confirmation.
- `POST /agent/actions/{action_id}/reject`: reject a proposal with optional reason.
- `POST /agent/actions/{action_id}/revert`: revert a reversible applied action after confirmation.

### Zotero

- `POST /zotero/import-runs/scan`: validate source, copy DB, scan candidates, return run id.
- `GET /zotero/import-runs/{run_id}`: get run summary and candidate counts.
- `GET /zotero/import-runs/{run_id}/candidates`: paged/filterable preview.
- `PATCH /zotero/import-runs/{run_id}/candidates/{candidate_id}`: update selected state.
- `POST /zotero/import-runs/{run_id}/import`: import selected candidates after final confirmation.

## Draft Task List

### Task 1: Add Phase 4 Persistence Models

**Files:**
- Create `backend/app/models/agent_run.py`
- Create `backend/app/models/agent_tool_event.py`
- Create `backend/app/models/agent_action.py`
- Create `backend/app/models/zotero_import_run.py`
- Create `backend/app/models/zotero_import_candidate.py`
- Modify `backend/app/models/__init__.py`
- Modify `backend/tests/test_db_migrations.py`

**Purpose:** Establish additive durable storage for Agent runs/actions/traces and Zotero import runs/candidates.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_db_migrations.py -q`
- Expected: migration tests pass and legacy paper rows remain unchanged.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: backend persistence developer. Task: add SQLModel models for Agent runs, Agent tool events, Agent actions, Zotero import runs, and Zotero import candidates, and register them with metadata creation. Restrictions: do not modify existing paper columns unless a migration test proves compatibility, do not store raw API keys, do not expose local PDF paths in user-facing fields, do not add PaperQuay source code. Leverage: existing `PaperBlock`, `PaperBlockTranslation`, `ChatSession`, timestamp patterns, and `test_db_migrations.py`. Requirements: 3, 4, 6, 7, 8, 9, 10, 11. Success: fresh and legacy SQLite databases create all new tables idempotently, existing paper/category/block rows are preserved, and migration tests pass.

### Task 2: Build Agent Read-Only Tool Registry

**Files:**
- Create `backend/app/services/agent_tool_registry.py`
- Create `backend/tests/test_agent_tool_registry.py`

**Purpose:** Provide bounded read-only library tools for the Agent without allowing writes.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_agent_tool_registry.py -q`
- Expected: tests prove bounded results, no local PDF paths, truncation flags, and structured errors.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: backend Agent tooling developer. Task: implement read-only Agent tools for listing papers, reading paper detail summaries, listing categories/tags, reading blocks/translations, and semantic search summaries. Restrictions: no write operations, no unbounded markdown/full-text output, no local file path exposure, no model call in this task. Leverage: `Paper`, `PaperContent`, `PaperSummary`, `PaperBlock`, `PaperBlockTranslation`, `category_service`, and semantic search patterns in `papers.py`. Requirements: 1, 2, 6. Success: tool registry returns predictable bounded payloads and records enough metadata for trace display.

### Task 3: Implement Agent Proposal Validation and Execution

**Files:**
- Create `backend/app/services/agent_proposal_service.py`
- Create `backend/tests/test_agent_proposal_service.py`

**Purpose:** Validate proposed actions, execute approved safe writes, and create audit events.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_agent_proposal_service.py -q`
- Expected: tests prove invalid targets are blocked, allowed writes update records, disallowed destructive actions are rejected, and revert works for reversible fields.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: backend safety and audit developer. Task: implement proposal validation, approval, execution, rejection, and revert for allowed Agent write actions. Restrictions: do not allow paper deletion, file deletion, local path updates, parse/summarize/embed/translate triggers, or automatic execution without approval. Leverage: `update_paper_category`, paper PATCH field behavior, tag update behavior, and new Agent models. Requirements: 3, 4, 5, 6, 7. Success: every write stores before/after values, action status transitions are durable, and safe revert creates linked audit events.

### Task 4: Build Agent Runner and API Routes

**Files:**
- Create `backend/app/schemas/agent.py`
- Create `backend/app/services/agent_runner_service.py`
- Create `backend/app/api/routes/agent.py`
- Modify `backend/app/main.py`
- Create `backend/tests/test_agent_api.py`

**Purpose:** Expose authenticated Agent run/proposal/approval APIs and integrate model-generated proposals.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_agent_api.py tests\test_agent_tool_registry.py tests\test_agent_proposal_service.py -q`
- Expected: tests prove auth-protected routes, run creation, proposal storage, approve/reject/revert flows, and no immediate writes from model output.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: FastAPI Agent contract developer. Task: create typed Agent schemas, runner service, and route module for creating runs, listing run details, approving/rejecting actions, batch approval, and revert. Restrictions: do not add routes to `papers.py`, do not expose model credentials, do not accept frontend system prompts, do not execute proposals before user approval. Leverage: `chat.py`, `DeepSeekClient`, `get_current_user` route protection in `main.py`, and new services. Requirements: 1-7, 12. Success: API tests cover happy path, validation failures, model malformed proposal rejection, and audit visibility.

### Task 5: Add Frontend Agent API Contracts

**Files:**
- Modify `frontend/src/types.ts`
- Modify `frontend/src/lib/api.ts`
- Modify `frontend/src/lib/api.test.ts`

**Purpose:** Establish typed frontend API integration before building Agent UI.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\lib\api.test.ts --reporter=dot`
- Run `.\node_modules\.bin\tsc.cmd --noEmit`
- Expected: API wrapper tests and typecheck pass.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: frontend API contract developer. Task: add TypeScript types and wrappers for Agent runs, tool events, proposals, approval, batch approval, rejection, and revert. Restrictions: no direct fetch calls in components, preserve existing API behavior, no UI work in this task. Leverage: existing `readJson`, `getAuthHeaders`, chat wrapper tests, and Phase 3 block wrapper patterns. Requirements: 1-7, 12. Success: tests prove URL/method/body/auth/error handling and TypeScript compiles.

### Task 6: Build Agent UI Components

**Files:**
- Create `frontend/src/components/agent/agentUtils.ts`
- Create `frontend/src/components/agent/agentUtils.test.ts`
- Create `frontend/src/components/agent/AgentScopePicker.tsx`
- Create `frontend/src/components/agent/AgentTracePanel.tsx`
- Create `frontend/src/components/agent/AgentProposalList.tsx`
- Create `frontend/src/components/agent/AgentWorkspace.tsx`
- Create `frontend/src/components/agent/AgentWorkspace.test.tsx`

**Purpose:** Provide presentational Agent workspace, trace, proposal, confirmation, and revert surfaces.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\components\agent\agentUtils.test.ts src\components\agent\AgentWorkspace.test.tsx --reporter=dot`
- Expected: tests cover scope selection, proposal grouping, approve/reject/revert callbacks, trace rendering, loading/error states, and accessible controls.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: React Agent UI developer. Task: build Agent utility helpers and presentational components for scope selection, run prompt, trace display, proposal review, batch confirmation, rejection, execution result, and revert actions. Restrictions: do not fetch inside presentational components, do not autosubmit approvals, do not render raw HTML, keep controls keyboard reachable and labeled. Leverage: `AiAssistantShell`, `StatusBadge`, `UiIcon`, library/reader component patterns. Requirements: 1, 3, 4, 6, 7, 12. Success: component tests prove safe review workflows and state rendering.

### Task 7: Orchestrate Agent Route

**Files:**
- Modify `frontend/src/App.tsx`
- Modify `frontend/src/App.test.tsx`
- Modify `frontend/src/index.css`

**Purpose:** Mount Agent workspace in the app shell and add responsive styling.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\App.test.tsx -t "Agent|assistant" --reporter=dot`
- Run `.\node_modules\.bin\tsc.cmd --noEmit`
- Expected: route tests prove Agent run creation, proposal approval/rejection, and legacy assistant behavior is preserved or intentionally redirected.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: React route integration and CSS engineer. Task: integrate Agent workspace into the app shell with route-level state and data-dense responsive styling. Restrictions: do not create a landing page, do not break existing library/reader/daily briefing routes, do not use viewport font scaling or decorative blobs, and do not leave unlabeled controls. Leverage: current `App.tsx`, `AiAssistantShell`, library CSS tokens, and route test style. Requirements: 1-7, 12. Success: route tests and typecheck pass, and CSS scan finds no banned block patterns in new Agent styles.

### Task 8: Build Zotero Source Validation and SQLite Reader

**Files:**
- Create `backend/app/services/zotero_source_service.py`
- Create `backend/tests/test_zotero_source_service.py`

**Purpose:** Safely validate Zotero source files, copy them to a temporary workspace, and open read-only SQLite connections.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_zotero_source_service.py -q`
- Expected: tests cover missing path, directory path, non-SQLite file, valid SQLite copy, original DB unmodified, and cleanup.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: backend import safety developer. Task: implement Zotero source validation, temp-copy creation, read-only SQLite connection handling, source fingerprinting, and cleanup helpers. Restrictions: never open original Zotero DB for write, do not store raw absolute paths in API responses, do not import candidates in this task. Leverage: `StorageService`, Python `sqlite3`, `tempfile`, and existing test fixture patterns. Requirements: 8, 11. Success: source safety tests prove read-only copy behavior and structured errors.

### Task 9: Build Zotero Mapping and Deduplication Services

**Files:**
- Create `backend/app/services/zotero_mapping_service.py`
- Create `backend/app/services/zotero_import_service.py`
- Create `backend/tests/fixtures/zotero_fixture_builder.py`
- Create `backend/tests/test_zotero_mapping_service.py`

**Purpose:** Convert Zotero SQLite rows into import candidates and mark duplicates/warnings.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_zotero_mapping_service.py -q`
- Expected: tests cover item metadata, creators, tags, collections, PDF attachments, unsupported item types, missing attachments, DOI/title duplicate detection, and 1,000-item fixture scan.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: backend Zotero mapping developer. Task: parse copied Zotero SQLite data into normalized import candidates with metadata, creators, collections, tags, attachments, warnings, duplicate state, and source keys. Restrictions: do not persist imported papers yet, do not mutate source DB, do not make malformed individual rows fatal. Leverage: new source service, existing `Paper` model, `StorageService`, and duplicate checks from current upload/import behavior. Requirements: 9, 10, 11. Success: tests prove mapping fidelity, warnings, duplicate defaults, and scan resilience.

### Task 10: Add Zotero API Routes

**Files:**
- Create `backend/app/schemas/zotero.py`
- Create `backend/app/api/routes/zotero.py`
- Modify `backend/app/main.py`
- Create `backend/tests/test_zotero_import_api.py`

**Purpose:** Expose scan, preview, candidate selection, and confirmed import endpoints.

**Verification:**
- Run `.\.venv\Scripts\python.exe -m pytest tests\test_zotero_import_api.py tests\test_zotero_source_service.py tests\test_zotero_mapping_service.py -q`
- Expected: tests prove authenticated scan, paged preview, filters, selection updates, confirmed import, duplicate skipping, metadata-only gating, and per-candidate failures.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: FastAPI Zotero contract developer. Task: implement typed Zotero scan/preview/import endpoints and persist import run/candidate state. Restrictions: do not add routes to `papers.py`, do not import unselected candidates, do not import metadata-only candidates unless explicitly allowed, do not expose raw absolute paths by default. Leverage: new Zotero services, existing auth route protection, `BackgroundTaskQueue` if scan/import is asynchronous, and `StorageService`. Requirements: 8-12. Success: API tests cover safe source handling, preview filters, import confirmation, duplicate behavior, and run reports.

### Task 11: Add Frontend Zotero API Contracts

**Files:**
- Modify `frontend/src/types.ts`
- Modify `frontend/src/lib/api.ts`
- Modify `frontend/src/lib/api.test.ts`

**Purpose:** Establish typed frontend API wrappers for Zotero import before building UI.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\lib\api.test.ts --reporter=dot`
- Run `.\node_modules\.bin\tsc.cmd --noEmit`
- Expected: API wrapper tests and typecheck pass.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: frontend Zotero API contract developer. Task: add TypeScript types and wrappers for Zotero scan, run detail, candidates, selection update, and confirmed import. Restrictions: no direct fetch calls in Zotero components, do not alter existing paper/block/agent wrappers, do not add UI in this task. Leverage: `readJson`, `getAuthHeaders`, existing API tests. Requirements: 8-12. Success: tests prove request shapes, auth headers, filter query construction, JSON payloads, and error propagation.

### Task 12: Build Zotero Import UI

**Files:**
- Create `frontend/src/components/zotero/zoteroUtils.ts`
- Create `frontend/src/components/zotero/zoteroUtils.test.ts`
- Create `frontend/src/components/zotero/ZoteroSourceForm.tsx`
- Create `frontend/src/components/zotero/ZoteroCandidateTable.tsx`
- Create `frontend/src/components/zotero/ZoteroImportSummary.tsx`
- Create `frontend/src/components/zotero/ZoteroImportPage.tsx`
- Create `frontend/src/components/zotero/ZoteroImportPage.test.tsx`

**Purpose:** Provide source scan, candidate preview, filters, selection, final confirmation, and import report UI.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\components\zotero\zoteroUtils.test.ts src\components\zotero\ZoteroImportPage.test.tsx --reporter=dot`
- Expected: tests cover source validation errors, loading state, filters, duplicate defaults, selection changes, final confirmation, import result, and accessible controls.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: React import workflow developer. Task: build Zotero import utility helpers and UI components for scan, preview, filter, selection, confirmation, progress, and report states. Restrictions: do not fetch inside presentational table rows, do not autosubmit imports, do not expose raw source path by default, keep controls labeled and keyboard reachable. Leverage: `LibraryImportModal`, `ImportConfirmDialog`, `StatusBadge`, `UiIcon`, existing library table/filter styles. Requirements: 8-12. Success: component tests prove safe import review workflow and visible warnings/errors.

### Task 13: Orchestrate Zotero Route and Styling

**Files:**
- Modify `frontend/src/App.tsx`
- Modify `frontend/src/App.test.tsx`
- Modify `frontend/src/index.css`

**Purpose:** Mount Zotero import route and make it usable across desktop/mobile.

**Verification:**
- Run `.\node_modules\.bin\vitest.cmd run src\App.test.tsx -t "Zotero|library import" --reporter=dot`
- Run `.\node_modules\.bin\tsc.cmd --noEmit`
- Expected: route tests prove navigation, scan-to-preview, selection, import confirmation, and no regression in existing library import.

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: React route and CSS integration developer. Task: add Zotero import route/navigation and responsive data-dense styling. Restrictions: do not replace existing manual PDF import, do not create a marketing page, do not use viewport font scaling or decorative blobs, and do not break library/reader routes. Leverage: `App.tsx`, library route tests, existing CSS variables, and import dialog patterns. Requirements: 8-12. Success: route tests and typecheck pass; UI has visible loading/empty/warning/failed/success states.

### Task 14: Final Phase 4 Integration Verification

**Files:**
- Modify `frontend/src/App.test.tsx`
- Modify relevant backend tests only if gaps remain
- Update `.spec-workflow/specs/paperquay-agent-zotero/tasks.md` when formal tasks exist

**Purpose:** Prove Agent and Zotero workflows work together and preserve Phase 1/2/3 behavior.

**Verification:**
- Run backend focused tests:
  - `.\.venv\Scripts\python.exe -m pytest tests\test_db_migrations.py tests\test_agent_tool_registry.py tests\test_agent_proposal_service.py tests\test_agent_api.py tests\test_zotero_source_service.py tests\test_zotero_mapping_service.py tests\test_zotero_import_api.py -q`
- Run frontend focused tests:
  - `.\node_modules\.bin\vitest.cmd run src\App.test.tsx src\lib\api.test.ts src\components\agent\agentUtils.test.ts src\components\agent\AgentWorkspace.test.tsx src\components\zotero\zoteroUtils.test.ts src\components\zotero\ZoteroImportPage.test.tsx --reporter=dot`
- Run typecheck:
  - `.\node_modules\.bin\tsc.cmd --noEmit`
- Run production build:
  - `npm run build`
- Run whitespace check:
  - `git diff --check`

**Prompt for implementing AI:**
Implement the task for spec `paperquay-agent-zotero`, first run `spec-workflow-guide` to get the workflow guide then implement the task. Role: full-stack integration verification engineer. Task: add any missing route-level coverage and run focused backend/frontend/typecheck/build verification for Phase 4. Restrictions: do not weaken Phase 1/2/3 tests, do not claim completion without command output, do not make large production changes except small fixes required by failing tests. Leverage: all new Phase 4 tests plus existing library, reader, block, and assistant route tests. Requirements: all. Success: all targeted commands pass or exact blockers are documented; implementation logs include API endpoints, components, functions, models, and integrations.

## Recommended Execution Order

1. Backend persistence and Agent backend tasks: Tasks 1-4.
2. Frontend Agent contract/UI/route tasks: Tasks 5-7.
3. Backend Zotero source/mapping/API tasks: Tasks 8-10.
4. Frontend Zotero contract/UI/route tasks: Tasks 11-13.
5. Final integration verification: Task 14.

## Parallelization Guidance for Other AI Models

- Safe parallel groups after Task 1 completes:
  - Agent backend Tasks 2-4 can proceed mostly separately from Zotero backend Tasks 8-10, but route registration in `main.py` must be integrated serially.
  - Frontend Agent Tasks 5-7 can proceed separately from Frontend Zotero Tasks 11-13 after API contracts are stable.
- Do not let two models modify `frontend/src/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/index.css`, `backend/app/main.py`, or `backend/tests/test_db_migrations.py` at the same time.
- Use separate worktrees or strict file ownership if multiple external AI models implement in parallel.
- Final integration must be done by one model after all branches are merged.

## Completion Gate

Do not mark Phase 4 complete until:

- Formal spec-workflow requirements, design, and tasks are approved.
- Every formal task is `[x]` and has a `log_implementation` entry.
- Backend focused tests pass.
- Frontend focused tests pass.
- `tsc --noEmit` passes.
- `npm run build` passes or a real environment blocker is documented with exact output.
- Agent write behavior has human confirmation and audit coverage.
- Zotero import never mutates the original Zotero database.
