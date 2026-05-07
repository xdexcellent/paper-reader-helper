# Tasks Document

## File Map

### Backend Agent Models
- `backend/app/models/agent_run.py`: durable Agent run metadata model.
- `backend/app/models/agent_tool_event.py`: bounded tool trace event model.
- `backend/app/models/agent_action.py`: proposed/approved/executed/rejected/reverted action model.
- `backend/app/models/__init__.py`: register new SQLModel table classes for metadata creation.

### Backend Agent Services
- `backend/app/services/agent_tool_registry.py`: bounded read-only library tools.
- `backend/app/services/agent_proposal_service.py`: proposal validation, execution, rejection, revert.
- `backend/app/services/agent_runner_service.py`: prompt composition, model call, proposal parsing.

### Backend Agent API
- `backend/app/schemas/agent.py`: Agent request/response contracts.
- `backend/app/api/routes/agent.py`: authenticated Agent endpoints.
- `backend/app/main.py`: include the Agent router.

### Backend Zotero Models
- `backend/app/models/zotero_import_run.py`: import run metadata model.
- `backend/app/models/zotero_import_candidate.py`: scanned candidate with dedupe/selection/result state.

### Backend Zotero Services
- `backend/app/services/zotero_source_service.py`: source validation, temp copy, read-only SQLite.
- `backend/app/services/zotero_mapping_service.py`: item/creator/tag/collection/attachment mapping.
- `backend/app/services/zotero_import_service.py`: preview, dedupe, confirmed import.

### Backend Zotero API
- `backend/app/schemas/zotero.py`: Zotero request/response contracts.
- `backend/app/api/routes/zotero.py`: authenticated Zotero endpoints.
- `backend/app/main.py`: include the Zotero router.

### Backend Tests
- `backend/tests/test_db_migrations.py`: add Phase 4 table creation and legacy data preservation coverage.
- `backend/tests/test_agent_tool_registry.py`: tool registry unit coverage.
- `backend/tests/test_agent_proposal_service.py`: proposal execution/validation/revert coverage.
- `backend/tests/test_agent_api.py`: Agent API route coverage.
- `backend/tests/test_zotero_source_service.py`: source safety unit coverage.
- `backend/tests/fixtures/zotero_fixture_builder.py` or `backend/tests/fixtures/zotero_sample.sqlite`: Zotero fixture data.
- `backend/tests/test_zotero_mapping_service.py`: mapping unit coverage.
- `backend/tests/test_zotero_import_api.py`: Zotero API route coverage.

### Frontend Types and API
- `frontend/src/types.ts`: add Agent and Zotero typed contracts.
- `frontend/src/lib/api.ts`: add Agent and Zotero API wrappers.
- `frontend/src/lib/api.test.ts`: API wrapper regression coverage.

### Frontend Agent Components
- `frontend/src/components/agent/agentUtils.ts`: type guards, labels, scope helpers.
- `frontend/src/components/agent/agentUtils.test.ts`: utility coverage.
- `frontend/src/components/agent/AgentScopePicker.tsx`: scope selection component.
- `frontend/src/components/agent/AgentTracePanel.tsx`: collapsible tool trace panel.
- `frontend/src/components/agent/AgentProposalList.tsx`: grouped proposal list with controls.
- `frontend/src/components/agent/AgentWorkspace.tsx`: root Agent component.
- `frontend/src/components/agent/AgentWorkspace.test.tsx`: component behavior coverage.

### Frontend Zotero Components
- `frontend/src/components/zotero/zoteroUtils.ts`: candidate filter/sort helpers, status labels.
- `frontend/src/components/zotero/zoteroUtils.test.ts`: utility coverage.
- `frontend/src/components/zotero/ZoteroSourceForm.tsx`: source path input with validation.
- `frontend/src/components/zotero/ZoteroCandidateTable.tsx`: candidate table with filters/selection.
- `frontend/src/components/zotero/ZoteroImportSummary.tsx`: import result summary.
- `frontend/src/components/zotero/ZoteroImportPage.tsx`: root import component.
- `frontend/src/components/zotero/ZoteroImportPage.test.tsx`: component behavior coverage.

### Frontend Route and Styling
- `frontend/src/App.tsx`: add Agent and Zotero routes + sidebar nav entries.
- `frontend/src/App.test.tsx`: route-level integration coverage.
- `frontend/src/index.css`: data-dense, responsive Agent/Zotero workspace styling.

---

- [ ] 1. Add Phase 4 persistence models
  - File: `backend/app/models/agent_run.py`
  - File: `backend/app/models/agent_tool_event.py`
  - File: `backend/app/models/agent_action.py`
  - File: `backend/app/models/zotero_import_run.py`
  - File: `backend/app/models/zotero_import_candidate.py`
  - File: `backend/app/models/__init__.py`
  - File: `backend/tests/test_db_migrations.py`
  - Create `AgentRun` with prompt, scope_type, scope_config_json, model, status, optional chat_session_id, and timestamps.
  - Create `AgentToolEvent` with agent_run_id, tool_name, input_summary, output_summary, status, error_message, and timestamp.
  - Create `AgentAction` with agent_run_id, action_type, target_paper_id, target_category_id, before_values_json, after_values_json, rationale, confidence, risk_level, status, revert_action_id, and timestamps.
  - Create `ZoteroImportRun` with source_fingerprint, status, imported/skipped/duplicate/warning/failed counts, error_message, and timestamps.
  - Create `ZoteroImportCandidate` with import_run_id, source_key, zotero_item_type, mapped metadata fields, mapped_collections_json, mapped_tags_json, attachment fields, is_duplicate, duplicate_of_paper_id, is_selected, warning_message, import_status, imported_paper_id, import_error, and timestamp.
  - Register all five new models in `backend/app/models/__init__.py` and ensure they are imported in `backend/app/main.py`.
  - Extend `test_db_migrations.py` to prove legacy SQLite databases create the new tables without changing existing paper/category/block rows.
  - Purpose: Establish durable Phase 4 storage before any service or API depends on it.
  - _Leverage: `Paper`, `PaperBlock`, `ChatSession`, `Category`, SQLModel timestamp patterns from existing models, `init_db`, and existing `test_db_migrations.py` patterns_
  - _Requirements: Requirement 3 AC 1-5, Requirement 4 AC 1-5, Requirement 5 AC 1-5, Requirement 6 AC 1-5, Requirement 7 AC 1-5, Requirement 8 AC 1-5, Requirement 9 AC 1-5, Requirement 10 AC 1-5, Requirement 11 AC 1-5_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: backend persistence developer. Task: add SQLModel models for Agent runs, Agent tool events, Agent actions, Zotero import runs, and Zotero import candidates, register them with metadata creation, and add additive migration tests. Restrictions: do not modify existing paper/category/block columns unless a migration test proves compatibility, do not store raw API keys, do not expose local PDF paths in user-facing fields, do not add PaperQuay source code. _Leverage: `PaperBlock`, `PaperBlockTranslation`, `ChatSession`, timestamp patterns, and `test_db_migrations.py`. _Requirements: Requirement 3-11. Success: fresh and legacy SQLite databases create all new tables idempotently, existing paper/category/block rows are preserved, and migration tests pass. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 2. Build Agent read-only tool registry
  - File: `backend/app/services/agent_tool_registry.py`
  - File: `backend/tests/test_agent_tool_registry.py`
  - Implement `list_papers(session, scope, filters)` returning bounded result by record count (max 50-100), with title/id/status/year/reading_status/favorite, no full text, no local paths.
  - Implement `get_paper_detail(session, paper_id)` returning metadata, summary short, category, tags, block type counts, reading state; no full markdown, no local path, no API keys.
  - Implement `list_categories(session)` returning category names, IDs, and paper counts.
  - Implement `list_tags(session)` returning distinct tags from library.
  - Implement `get_paper_blocks(session, paper_id)` returning block type/page summary, bounded text snippets, no source_json.
  - Implement `get_paper_translations(session, paper_id)` returning translation status summary.
  - Implement `semantic_search(session, query, top_k=10)` with bounded results and similarity scores.
  - Every tool result must include truncation indicator when bounded.
  - Every tool must return structured error on failure without applying library changes.
  - Add unit tests for bounded results, no local path exposure, truncation flags, empty scope, 404 paper, tool errors.
  - Purpose: Provide bounded read-only library tools for the Agent without allowing writes or exposing sensitive data.
  - _Leverage: `Paper`, `PaperContent`, `PaperSummary`, `PaperBlock`, `PaperBlockTranslation`, `PaperEmbedding`, `Category`, existing query patterns from `papers.py` and `paper_blocks.py`_
  - _Requirements: Requirement 1 AC 1-5, Requirement 2 AC 1-5, Requirement 6 AC 2_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: backend Agent tooling developer. Task: implement read-only Agent tools for listing papers, reading paper detail summaries, listing categories/tags, reading blocks/translations, and semantic search summaries, all with bounded output and no sensitive data exposure. Restrictions: no write operations, no unbounded markdown/full-text output, no local file path exposure, no model call in this task. _Leverage: `Paper`, `PaperContent`, `PaperSummary`, `PaperBlock`, `PaperBlockTranslation`, `category_service`, and semantic search patterns in `papers.py`. _Requirements: Requirement 1, 2, 6. Success: tool registry returns predictable bounded payloads and records enough metadata for trace display. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 3. Implement Agent proposal validation and execution service
  - File: `backend/app/services/agent_proposal_service.py`
  - File: `backend/tests/test_agent_proposal_service.py`
  - Implement `validate_proposal(session, action)` checking target existence, allowed action types, before/after values.
  - Implement `execute_action(session, action)` performing writes through existing paper/category update services; support update_paper_metadata (title, authors, year, venue, doi, url, favorite, reading_status, reading_progress, user_notes), update_tags, update_category, create_category, assign_category.
  - Implement `reject_action(session, action, reason)` marking rejected.
  - Implement `revert_action(session, action)` restoring before_values after stale-target check; creating linked revert audit event.
  - Implement `batch_execute(session, actions)` executing independent actions, skipping dependents of failed actions, returning counts.
  - Block destructive actions: delete paper, delete files, modify local path, trigger parse/summarize/embed/translate.
  - Add unit tests for valid execution of each action type, invalid target rejection, disallowed action rejection, batch partial failure, revert success, and stale-target revert block.
  - Purpose: Provide a safe execution gate for all Agent write operations with full audit trail.
  - _Leverage: `update_paper_category`, paper PATCH field behavior, tag update behavior, `category_service.create_category`, new Agent models_
  - _Requirements: Requirement 3 AC 1-5, Requirement 4 AC 1-5, Requirement 5 AC 1-5, Requirement 6 AC 3, Requirement 7 AC 1-5_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: backend safety and audit developer. Task: implement proposal validation, approval, execution, rejection, and revert for allowed Agent write actions. Restrictions: do not allow paper deletion, file deletion, local path updates, parse/summarize/embed/translate triggers, or automatic execution without approval. _Leverage: `update_paper_category`, paper PATCH field behavior, tag update behavior, and new Agent models. _Requirements: Requirement 3-7. Success: every write stores before/after values, action status transitions are durable, and safe revert creates linked audit events. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 4. Build Agent runner service and API routes
  - File: `backend/app/schemas/agent.py`
  - File: `backend/app/services/agent_runner_service.py`
  - File: `backend/app/api/routes/agent.py`
  - File: `backend/app/main.py`
  - File: `backend/tests/test_agent_api.py`
  - Add typed Agent schemas: `AgentRunCreate`, `AgentScopeConfig`, `AgentRunResponse`, `AgentActionResponse`, `AgentToolEventResponse`, `BatchApproveRequest`, `BatchApproveResponse`, `RejectRequest`.
  - Implement `AgentRunnerService.create_run` creating `AgentRun` record with prompt, scope, model.
  - Implement `AgentRunnerService.execute_run` resolving scope, calling read-only tools, composing system prompt (server-composed, no frontend prompt injection), calling `DeepSeekClient.chat()`, parsing model response for structured proposals, creating `AgentAction` records (status=proposed), recording `AgentToolEvent` records.
  - System prompt must hardcode the Agent role ("你是一个专业的论文库管理助手"), tool specifications, and output format; frontend MUST NOT supply system instructions.
  - Model response parsing must handle JSON repair and fallback.
  - Add authenticated routes: `POST /agent/runs`, `GET /agent/runs`, `GET /agent/runs/{run_id}`.
  - Add authenticated action routes: `POST /agent/actions/{action_id}/approve`, `POST /agent/runs/{run_id}/approve-batch`, `POST /agent/actions/{action_id}/reject`, `POST /agent/actions/{action_id}/revert`.
  - Register the new router in `main.py` under `protected_dependencies`.
  - Add API tests for run creation, run listing, run detail with proposals/traces, auth protection, approve/reject/revert flows, batch execution with counts, missing run/action 404s.
  - Purpose: Expose authenticated Agent API with model-generated proposals and human approval gates.
  - _Leverage: `DeepSeekClient.chat()`, `chat.py` legacy patterns, `AgentToolRegistry`, `AgentProposalService`, `get_current_user`, route registration in `main.py`_
  - _Requirements: Requirement 1 AC 1-5, Requirement 2 AC 1-5, Requirement 3 AC 1-5, Requirement 4 AC 1-5, Requirement 5 AC 1-5, Requirement 6 AC 1-4, Requirement 7 AC 1-5, Requirement 12 AC 3-4_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: FastAPI Agent contract developer. Task: create typed Agent schemas, runner service, and route module for creating runs, listing run details, approving/rejecting actions, batch approval, and revert. Restrictions: do not add routes to `papers.py`, do not expose model credentials, do not accept frontend system prompts, do not execute proposals before user approval. _Leverage: `chat.py`, `DeepSeekClient`, `get_current_user` route protection in `main.py`, and new services. _Requirements: Requirement 1-7, 12. Success: API tests cover happy path, validation failures, model malformed proposal rejection, and audit visibility. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 5. Add frontend Agent API contracts
  - File: `frontend/src/types.ts`
  - File: `frontend/src/lib/api.ts`
  - File: `frontend/src/lib/api.test.ts`
  - Add TypeScript types for `AgentRunResponse`, `AgentScopeConfig`, `AgentActionResponse`, `AgentToolEventResponse`, `BatchApproveResponse`.
  - Add API wrappers: `createAgentRun`, `fetchAgentRuns`, `fetchAgentRunDetail`, `approveAgentAction`, `batchApproveAgentActions`, `rejectAgentAction`, `revertAgentAction`.
  - All wrappers must use `readJson` and `getAuthHeaders` from existing API patterns.
  - Add API wrapper tests for request methods, URLs, auth headers, JSON payloads, and error propagation.
  - Purpose: Establish typed frontend API integration before building Agent UI.
  - _Leverage: existing `readJson`, `getAuthHeaders`, chat wrapper tests, Phase 3 block wrapper patterns_
  - _Requirements: Requirement 1-7, Requirement 12 AC 1-2_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: frontend API contract developer. Task: add TypeScript types and wrappers for Agent runs, tool events, proposals, approval, batch approval, rejection, and revert. Restrictions: no direct fetch calls in components, preserve existing API behavior, no UI work in this task. _Leverage: existing `readJson`, `getAuthHeaders`, chat wrapper tests, and Phase 3 block wrapper patterns. _Requirements: Requirement 1-7, 12. Success: tests prove URL/method/body/auth/error handling and TypeScript compiles. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 6. Build Agent UI components
  - File: `frontend/src/components/agent/agentUtils.ts`
  - File: `frontend/src/components/agent/agentUtils.test.ts`
  - File: `frontend/src/components/agent/AgentScopePicker.tsx`
  - File: `frontend/src/components/agent/AgentTracePanel.tsx`
  - File: `frontend/src/components/agent/AgentProposalList.tsx`
  - File: `frontend/src/components/agent/AgentWorkspace.tsx`
  - File: `frontend/src/components/agent/AgentWorkspace.test.tsx`
  - Implement agent utility helpers: risk level labels/colors, action type labels, scope serialization, before/after value diff.
  - Implement `AgentScopePicker` with whole library / category dropdown / paper multi-select / reader-paper auto modes.
  - Implement `AgentTracePanel` as collapsible tool trace showing which data was consulted.
  - Implement `AgentProposalList` grouping proposals by risk and action type; per-proposal approve/reject/expand; batch footer with confirmation summary.
  - Implement `AgentWorkspace` composing scope picker, prompt input, run trigger, trace panel, proposal list, execution result.
  - All components must receive data/handlers via props; no direct `fetch` in presentational components.
  - Controls must be keyboard reachable and have accessible names.
  - Add component tests for scope selection, proposal grouping, approve/reject/revert callbacks, trace rendering, loading/error/empty states.
  - Purpose: Provide presentational Agent workspace, trace, proposal, confirmation, and revert surfaces.
  - _Leverage: `AiAssistantShell`, `StatusBadge`, `UiIcon`, library/reader component patterns_
  - _Requirements: Requirement 1 AC 1-5, Requirement 3 AC 1-5, Requirement 4 AC 1-5, Requirement 6 AC 4, Requirement 7 AC 2-4, Requirement 12 AC 1-5_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React Agent UI developer. Task: build Agent utility helpers and presentational components for scope selection, run prompt, trace display, proposal review, batch confirmation, rejection, execution result, and revert actions. Restrictions: do not fetch inside presentational components, do not autosubmit approvals, do not render raw HTML, keep controls keyboard reachable and labeled. _Leverage: `AiAssistantShell`, `StatusBadge`, `UiIcon`, library/reader component patterns. _Requirements: Requirement 1, 3, 4, 6, 7, 12. Success: component tests prove safe review workflows and state rendering. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 7. Orchestrate Agent route and styling
  - File: `frontend/src/App.tsx`
  - File: `frontend/src/App.test.tsx`
  - File: `frontend/src/index.css`
  - Add `/agent` route rendering `AgentWorkspace` with workspace header ("文库 Agent", "AI 辅助整理你的论文库").
  - Add sidebar nav entry for Agent with icon and label.
  - Add route-level tests for Agent run creation, proposal display, proposal approval, proposal rejection, and batch execution.
  - Confirm legacy routes (library, reader, briefing, assistant, recommendations, stats, subscribe) are preserved and working.
  - Add responsive CSS for Agent workspace: data-dense layout, proposal grouping, trace panel, confirmation surface, loading/empty/error states.
  - Avoid viewport font scaling, decorative blobs/orbs, new gradients, and negative letter-spacing in new styles.
  - Purpose: Mount Agent workspace in the app shell with route-level state and responsive styling.
  - _Leverage: current `App.tsx` route patterns, `AiAssistantShell`, library CSS tokens, and route test style_
  - _Requirements: Requirement 1-7, Requirement 12 AC 1-5_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React route integration and CSS engineer. Task: integrate Agent workspace into the app shell with route-level state and data-dense responsive styling. Restrictions: do not create a landing page, do not break existing library/reader/daily briefing routes, do not use viewport font scaling or decorative blobs, and do not leave unlabeled controls. _Leverage: current `App.tsx`, `AiAssistantShell`, library CSS tokens, and route test style. _Requirements: Requirement 1-7, 12. Success: route tests and typecheck pass, and CSS scan finds no banned block patterns in new Agent styles. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 8. Build Zotero source validation and SQLite reader service
  - File: `backend/app/services/zotero_source_service.py`
  - File: `backend/tests/test_zotero_source_service.py`
  - Implement `validate_source(source_path)` checking existence, file type, readability, SQLite header; returning `SourceInfo` with fingerprint (SHA256 of path).
  - Implement `create_temp_copy(source_path)` copying `zotero.sqlite` to `tempfile`-managed temp workspace directory.
  - Implement `open_read_only(db_path)` returning a `sqlite3.Connection` with `mode=ro` and `uri=True`.
  - Implement `cleanup_temp_copy(db_path)` removing the temp copy file.
  - Original Zotero database must NEVER be opened for write.
  - Add unit tests for valid source, missing path, directory path, non-SQLite file, temp copy creation/verification, original DB unmodified, and cleanup.
  - Purpose: Safely validate Zotero source files, copy to temp workspace, and open read-only SQLite connections.
  - _Leverage: `StorageService` patterns, Python `sqlite3`, `tempfile`, `hashlib`, existing test fixture patterns_
  - _Requirements: Requirement 8 AC 1-5, Requirement 11 AC 1-5_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: backend import safety developer. Task: implement Zotero source validation, temp-copy creation, read-only SQLite connection handling, source fingerprinting, and cleanup helpers. Restrictions: never open original Zotero DB for write, do not store raw absolute paths in API responses, do not import candidates in this task. _Leverage: `StorageService`, Python `sqlite3`, `tempfile`, and existing test fixture patterns. _Requirements: Requirement 8, 11. Success: source safety tests prove read-only copy behavior and structured errors. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 9. Build Zotero mapping and deduplication services
  - File: `backend/app/services/zotero_mapping_service.py`
  - File: `backend/app/services/zotero_import_service.py`
  - File: `backend/tests/fixtures/zotero_fixture_builder.py`
  - File: `backend/tests/test_zotero_mapping_service.py`
  - Implement `ZoteroMappingService.scan_items(conn)` querying items, itemData, creators, collections, tags, itemAttachments from the Zotero SQLite schema.
  - Implement `ZoteroMappingService.map_candidate(item)` flattening creators into `authors` string (lastName + firstName), normalizing pub date into year, mapping collections as list, mapping tags as list, identifying PDF attachments by MIME type.
  - Support journalArticle, conferencePaper, bookSection, thesis, preprint, and report item types; unsupported types produce a warning and are skipped from selection by default.
  - Implement `ZoteroImportService.build_candidates(session, run, items)` creating `ZoteroImportCandidate` records.
  - Implement `ZoteroImportService.detect_duplicates(session, candidate)` comparing by DOI (normalized URL prefix), normalized title (case-insensitive, punctuation-insensitive), and URL against existing papers; attachment filename as weak signal only.
  - Duplicates default to `is_selected=False`.
  - Add fixture builder to create a minimal Zotero-formatted SQLite database for tests.
  - Add unit tests for item metadata extraction, creator flattening, collection/tag mapping, PDF attachment detection, unsupported item type warning, malformed row tolerance, DOI/title duplicate detection, and 500+ item fixture scan.
  - Purpose: Convert Zotero SQLite rows into import candidates and mark duplicates/warnings.
  - _Leverage: `ZoteroSourceService`, existing `Paper` model, `StorageService`, and duplicate checks from current upload/import behavior_
  - _Requirements: Requirement 9 AC 1-5, Requirement 10 AC 1-5, Requirement 11 AC 3-4_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: backend Zotero mapping developer. Task: parse copied Zotero SQLite data into normalized import candidates with metadata, creators, collections, tags, attachments, warnings, duplicate state, and source keys. Restrictions: do not persist imported papers yet, do not mutate source DB, do not make malformed individual rows fatal. _Leverage: new source service, existing `Paper` model, `StorageService`, and duplicate checks from current upload/import behavior. _Requirements: Requirement 9, 10, 11. Success: tests prove mapping fidelity, warnings, duplicate defaults, and scan resilience. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 10. Add Zotero API routes
  - File: `backend/app/schemas/zotero.py`
  - File: `backend/app/api/routes/zotero.py`
  - File: `backend/app/main.py`
  - File: `backend/tests/test_zotero_import_api.py`
  - Add typed Zotero schemas: `ZoteroScanRequest`, `ZoteroRunResponse`, `ZoteroCandidateResponse`, `ZoteroCandidateFilter`, `ZoteroImportConfirm`, `CandidateSelectUpdate`.
  - Implement `POST /zotero/import-runs/scan` validating source, copying DB, scanning candidates, returning run id.
  - Implement `GET /zotero/import-runs/{run_id}` returning run summary with candidate counts.
  - Implement `GET /zotero/import-runs/{run_id}/candidates` with pagination and filtering by collection, tag, attachment_status, duplicate_status, warning_status.
  - Implement `PATCH /zotero/import-runs/{run_id}/candidates/{candidate_id}` updating `is_selected` field.
  - Implement `POST /zotero/import-runs/{run_id}/import` importing selected candidates after final confirmation; metadata-only imports require `allow_metadata_only=True`.
  - Register the new router in `main.py` under `protected_dependencies`.
  - Add API tests for authenticated scan, paged preview with filters, selection updates, confirmed import, duplicate skipping, metadata-only gating, and per-candidate failures.
  - Purpose: Expose scan, preview, candidate selection, and confirmed import endpoints.
  - _Leverage: new Zotero services, `get_current_user` auth protection, `BackgroundTaskQueue` if scan is asynchronous, `StorageService`_
  - _Requirements: Requirement 8-12_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: FastAPI Zotero contract developer. Task: implement typed Zotero scan/preview/import endpoints and persist import run/candidate state. Restrictions: do not add routes to `papers.py`, do not import unselected candidates, do not import metadata-only candidates unless explicitly allowed, do not expose raw absolute paths by default. _Leverage: new Zotero services, existing auth route protection, `BackgroundTaskQueue`, and `StorageService`. _Requirements: Requirement 8-12. Success: API tests cover safe source handling, preview filters, import confirmation, duplicate behavior, and run reports. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 11. Add frontend Zotero API contracts
  - File: `frontend/src/types.ts`
  - File: `frontend/src/lib/api.ts`
  - File: `frontend/src/lib/api.test.ts`
  - Add TypeScript types for `ZoteroRunResponse`, `ZoteroCandidateResponse`, `ZoteroCandidateFilter`, `ZoteroImportConfirm`.
  - Add API wrappers: `scanZotero`, `fetchZoteroRun`, `fetchZoteroCandidates`, `updateCandidateSelection`, `importZoteroCandidates`.
  - All wrappers must use `readJson` and `getAuthHeaders`.
  - Add API wrapper tests for request methods, URLs, auth headers, filter query construction, JSON payloads, and error propagation.
  - Purpose: Establish typed frontend API wrappers for Zotero import before building UI.
  - _Leverage: `readJson`, `getAuthHeaders`, existing API test patterns, Phase 3 block wrapper patterns_
  - _Requirements: Requirement 8-12_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: frontend Zotero API contract developer. Task: add TypeScript types and wrappers for Zotero scan, run detail, candidates, selection update, and confirmed import. Restrictions: no direct fetch calls in Zotero components, do not alter existing paper/block/agent wrappers, do not add UI in this task. _Leverage: `readJson`, `getAuthHeaders`, existing API tests. _Requirements: Requirement 8-12. Success: tests prove request shapes, auth headers, filter query construction, JSON payloads, and error propagation. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 12. Build Zotero import UI components
  - File: `frontend/src/components/zotero/zoteroUtils.ts`
  - File: `frontend/src/components/zotero/zoteroUtils.test.ts`
  - File: `frontend/src/components/zotero/ZoteroSourceForm.tsx`
  - File: `frontend/src/components/zotero/ZoteroCandidateTable.tsx`
  - File: `frontend/src/components/zotero/ZoteroImportSummary.tsx`
  - File: `frontend/src/components/zotero/ZoteroImportPage.tsx`
  - File: `frontend/src/components/zotero/ZoteroImportPage.test.tsx`
  - Implement zotero utility helpers: attachment/duplicate/warning status labels, candidate sort/filter helpers, collection/tag chip formatting.
  - Implement `ZoteroSourceForm` with path input, validation feedback, and scan button.
  - Implement `ZoteroCandidateTable` with row selection, column display (title, authors, year, collections, tags, attachment, duplicate status, warning), filters (collection, tag, attachment_status, duplicate_status, warning_status), duplicate/warning badges.
  - Implement `ZoteroImportSummary` showing imported/skipped/duplicate/warning/failed counts with per-candidate detail.
  - Implement `ZoteroImportPage` composing source form, candidate table, filters, import confirmation, progress, and result summary.
  - All components must receive data/handlers via props; no direct `fetch` in presentational components.
  - Controls must be keyboard reachable and have accessible names.
  - Add component tests for source validation errors, loading state, filters, duplicate defaults, selection changes, final confirmation, import result, and accessible controls.
  - Purpose: Provide source scan, candidate preview, filters, selection, final confirmation, and import report UI.
  - _Leverage: `LibraryImportModal`, `ImportConfirmDialog`, `StatusBadge`, `UiIcon`, existing library table/filter styles_
  - _Requirements: Requirement 8-12_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React import workflow developer. Task: build Zotero import utility helpers and UI components for scan, preview, filter, selection, confirmation, progress, and report states. Restrictions: do not fetch inside presentational table rows, do not autosubmit imports, do not expose raw source path by default, keep controls labeled and keyboard reachable. _Leverage: `LibraryImportModal`, `ImportConfirmDialog`, `StatusBadge`, `UiIcon`, existing library table/filter styles. _Requirements: Requirement 8-12. Success: component tests prove safe import review workflow and visible warnings/errors. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 13. Orchestrate Zotero route and styling
  - File: `frontend/src/App.tsx`
  - File: `frontend/src/App.test.tsx`
  - File: `frontend/src/index.css`
  - Add `/zotero/import` route rendering `ZoteroImportPage` with workspace header ("Zotero 导入", "从 Zotero 论文库安全导入到本地").
  - Add sidebar nav entry for Zotero import with icon and label.
  - Add route-level tests for navigation, scan-to-preview, candidate filtering, selection changes, import confirmation, and no regression in existing manual PDF import.
  - Add responsive CSS for Zotero import workspace: scan form, candidate table with badges, filter bar, import confirmation, progress, report states.
  - Avoid viewport font scaling, decorative blobs/orbs, new gradients, and negative letter-spacing in new styles.
  - Purpose: Mount Zotero import route and make it usable across desktop/mobile.
  - _Leverage: `App.tsx`, library route tests, existing CSS variables, and import dialog patterns_
  - _Requirements: Requirement 8-12_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: React route and CSS integration developer. Task: add Zotero import route/navigation and responsive data-dense styling. Restrictions: do not replace existing manual PDF import, do not create a marketing page, do not use viewport font scaling or decorative blobs, and do not break library/reader routes. _Leverage: `App.tsx`, library route tests, existing CSS variables, and import dialog patterns. _Requirements: Requirement 8-12. Success: route tests and typecheck pass; UI has visible loading/empty/warning/failed/success states. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

- [ ] 14. Final Phase 4 integration verification
  - File: `frontend/src/App.test.tsx`
  - File: relevant backend tests only if gaps remain
  - Add any missing route-level coverage for Agent and Zotero workflows.
  - Ensure existing Phase 1/2/3 behavior is preserved: library list, paper detail, reader Markdown/PDF/blocks, daily briefing, AI assistant, recommendations, stats, subscriptions.
  - Run backend focused tests:
    - `.\.venv\Scripts\python.exe -m pytest tests\test_db_migrations.py tests\test_agent_tool_registry.py tests\test_agent_proposal_service.py tests\test_agent_api.py tests\test_zotero_source_service.py tests\test_zotero_mapping_service.py tests\test_zotero_import_api.py -q`
  - Run frontend focused tests:
    - `.\node_modules\.bin\vitest.cmd run src\App.test.tsx src\lib\api.test.ts src\components\agent\agentUtils.test.ts src\components\agent\AgentWorkspace.test.tsx src\components\zotero\zoteroUtils.test.ts src\components\zotero\ZoteroImportPage.test.tsx --reporter=dot`
  - Run typecheck: `.\node_modules\.bin\tsc.cmd --noEmit`
  - Run production build: `npm run build`
  - Run whitespace check: `git diff --check` for Phase 4 files.
  - Purpose: Prove Agent and Zotero workflows work together and preserve Phase 1/2/3 behavior.
  - _Leverage: all new Phase 4 tests plus existing library, reader, block, and assistant route tests_
  - _Requirements: all 12 requirements_
  - _Prompt: Implement the task for spec paperquay-agent-zotero, first run spec-workflow-guide to get the workflow guide then implement the task: Role: full-stack integration verification engineer. Task: add any missing route-level coverage and run focused backend/frontend/typecheck/build verification for Phase 4. Restrictions: do not weaken Phase 1/2/3 tests, do not claim completion without command output, do not make large production changes except small fixes required by failing tests. _Leverage: all new Phase 4 tests plus existing library, reader, block, and assistant route tests. _Requirements: all. Success: all targeted commands pass or exact blockers are documented; implementation logs include API endpoints, components, functions, models, and integrations. Before coding, mark this task from `[ ]` to `[-]` in `tasks.md`; after implementation and verification, call `log_implementation` with structured artifacts, then mark the task `[x]`._

---

## Recommended Execution Order

1. **Backend persistence**: Task 1
2. **Backend Agent**: Tasks 2-4 (tool registry → proposal service → runner + API)
3. **Frontend Agent**: Tasks 5-7 (API contracts → UI components → route + styling)
4. **Backend Zotero**: Tasks 8-10 (source service → mapping + dedupe → API routes)
5. **Frontend Zotero**: Tasks 11-13 (API contracts → UI components → route + styling)
6. **Final verification**: Task 14

## Parallelization Guidance

After Task 1 (persistence models) completes:
- Agent backend Tasks 2-4 can proceed in parallel with Zotero backend Tasks 8-10.
- Frontend Agent Tasks 5-7 can proceed in parallel with Frontend Zotero Tasks 11-13 after respective backend APIs are stable.
- Do NOT let two workers modify these shared files simultaneously: `frontend/src/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/index.css`, `backend/app/main.py`, `backend/app/models/__init__.py`, `backend/tests/test_db_migrations.py`.
- Final verification (Task 14) must be done by one worker after all branches are merged.

## Completion Gate

Do not mark Phase 4 complete until:

- Every formal task is `[x]` and has a `log_implementation` entry.
- Backend focused tests pass (Agent + Zotero).
- Frontend focused tests pass (Agent + Zotero).
- `tsc --noEmit` passes.
- `npm run build` passes or blocker documented.
- Agent write behavior has human confirmation and audit coverage.
- Zotero import never mutates the original Zotero database.
- Legacy Phase 1/2/3 routes and behavior preserved.
