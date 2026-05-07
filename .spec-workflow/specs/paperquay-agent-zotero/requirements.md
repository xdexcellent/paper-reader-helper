# Requirements Document

## Introduction

PaperQuay Phase 4 adds two high-risk capabilities on top of the completed library, reader, block, and translation phases:

1. A library Agent workspace that can inspect the local paper library, propose metadata/category/tag/reading-state operations, require human confirmation before any write, execute approved operations, and preserve an audit trail.
2. A read-only Zotero import flow that copies a selected Zotero SQLite database to a temporary workspace, previews import candidates, maps collections/tags/metadata/attachments into the current library model, and imports only after user confirmation.

The feature must preserve the current FastAPI + SQLModel + SQLite + React/Vite architecture. It must not copy PaperQuay source code or adopt Tauri/Rust. All write operations must be explicit, reversible where practical, and auditable.

## Alignment with Product Vision

This phase completes the PRD Phase 4 direction: upgrading the existing research assistant into a controlled library Agent workspace and adding Zotero read-only import. It extends the PaperQuay-inspired library without changing the project's Web stack, current authentication model, paper routes, reader, MinerU block store, or cached translation behavior.

## Requirements

### Requirement 1: Agent Workspace Entry and Scope

**User Story:** As a research user, I want a dedicated library Agent workspace, so that I can ask the system to organize and inspect my paper library without losing control over changes.

#### Acceptance Criteria

1. WHEN the user opens the Agent workspace THEN the system SHALL show an Agent-specific surface separate from the legacy quick chat.
2. WHEN the Agent workspace loads THEN the system SHALL show the active scope: whole library, selected category, selected papers, or current reader paper.
3. WHEN no scope is selected THEN the system SHALL default to read-only whole-library inspection.
4. IF the user selects a subset of papers THEN the system SHALL restrict proposed operations to that subset unless the user changes the scope.
5. WHEN the user asks a normal research question THEN the system SHALL answer without creating write proposals unless the user asks for organization or library operations.

### Requirement 2: Agent Read-Only Library Tools

**User Story:** As a research user, I want the Agent to search, summarize, and inspect my library, so that it can ground its recommendations in existing records.

#### Acceptance Criteria

1. WHEN the Agent needs library context THEN the system SHALL provide read-only tool results for paper list, paper detail, category list, tags, reading status, blocks, translations, and semantic search.
2. WHEN returning tool results to the model THEN the system SHALL bound result size and omit local PDF paths, API keys, raw source JSON, and unbounded full-text content.
3. IF a tool query would return too many records THEN the system SHALL return a summarized result and a truncation indicator.
4. WHEN a read-only tool fails THEN the system SHALL include a structured tool error in the Agent trace without applying any library changes.
5. WHEN tool results are shown in the UI THEN the system SHALL display which data was consulted in a concise trace panel.

### Requirement 3: Agent Proposed Actions

**User Story:** As a research user, I want the Agent to propose library changes before executing them, so that I can review and approve each operation.

#### Acceptance Criteria

1. WHEN the Agent recommends a write operation THEN the system SHALL store it as a proposed action, not execute it immediately.
2. WHEN a proposed action is created THEN it SHALL include action type, target paper/category/tag ids, before values, after values, rationale, confidence, and risk level.
3. IF the proposal references missing or stale targets THEN the system SHALL mark it invalid and prevent approval.
4. WHEN proposals are displayed THEN the UI SHALL group them by risk and action type.
5. WHEN the user rejects a proposal THEN the system SHALL persist the rejection reason when provided and SHALL NOT execute the action.

### Requirement 4: Human Confirmation for Writes

**User Story:** As a research user, I want to approve write operations one-by-one or in batches, so that bulk organization remains safe.

#### Acceptance Criteria

1. WHEN the user approves a single proposal THEN the system SHALL execute only that proposal.
2. WHEN the user approves a batch THEN the system SHALL show a final confirmation summary with counts by action type and risk level.
3. IF any approved action fails during batch execution THEN the system SHALL record the failure and continue only with independent actions that do not depend on the failed action.
4. WHEN execution finishes THEN the system SHALL show applied, skipped, failed, and rejected counts.
5. IF an action type is destructive or irreversible THEN the system SHALL require explicit per-action confirmation and SHALL NOT allow it in one-click batch approval.

### Requirement 5: Supported Agent Write Actions

**User Story:** As a research user, I want the Agent to help with common library maintenance tasks, so that I can organize papers faster without hand-editing every record.

#### Acceptance Criteria

1. WHEN approved THEN the Agent MAY update paper tags, primary category, favorite flag, reading status, reading progress, user notes, title, authors, year, venue, DOI, and URL.
2. WHEN approved THEN the Agent MAY create a non-system category with name and description.
3. WHEN approved THEN the Agent MAY assign papers to existing active categories.
4. WHEN approved THEN the Agent SHALL NOT delete papers, delete files, modify local PDF paths, remove parse artifacts, modify translations, or trigger external network imports in Phase 4.
5. WHEN approved THEN the Agent SHALL use existing paper/category update services or route-equivalent service functions instead of duplicating persistence logic.

### Requirement 6: Agent Execution Trace and Audit Trail

**User Story:** As a research user, I want every Agent operation to be traceable, so that I can understand what changed and why.

#### Acceptance Criteria

1. WHEN an Agent run starts THEN the system SHALL create a durable run record with prompt, scope, model, status, timestamps, and optional linked chat session id.
2. WHEN the Agent calls a tool THEN the system SHALL record tool name, bounded input, bounded output summary, status, and error if any.
3. WHEN an action is proposed, approved, rejected, executed, skipped, or failed THEN the system SHALL record a durable audit event.
4. WHEN the user opens an Agent run THEN the UI SHALL show prompt, trace, proposals, approvals, and execution results.
5. IF the user deletes a paper later THEN existing Agent audit records SHALL preserve safe textual summaries but SHALL not expose stale local file paths.

### Requirement 7: Reversal and Recovery

**User Story:** As a research user, I want safe recovery from Agent mistakes, so that experimentation with Agent organization is low risk.

#### Acceptance Criteria

1. WHEN an action changes scalar paper metadata THEN the system SHALL store enough before/after data to support a manual revert action.
2. WHEN a reversible action has been applied THEN the UI SHALL show a revert affordance in the audit detail.
3. IF the target record changed after the action was applied THEN revert SHALL require user confirmation and SHALL show the current value.
4. WHEN a revert succeeds THEN the system SHALL create a new audit event linking back to the original action.
5. IF an action cannot be reversed automatically THEN the system SHALL mark it as non-reversible before approval.

### Requirement 8: Zotero Source Selection and Safety

**User Story:** As a Zotero user, I want to import from Zotero without risking my original library, so that I can migrate references safely.

#### Acceptance Criteria

1. WHEN the user starts Zotero import THEN the system SHALL ask for an explicit path to `zotero.sqlite` or a user-selected copy of that file.
2. WHEN the backend receives the source path THEN it SHALL validate that the file exists, is a file, is readable, and has a SQLite header.
3. WHEN reading Zotero data THEN the system SHALL copy the database to a temporary import workspace and open the copy read-only.
4. WHEN import finishes or is cancelled THEN temporary copies SHALL be cleaned up when safe, while import audit records remain.
5. The system SHALL NOT modify the original Zotero database.

### Requirement 9: Zotero Mapping and Preview

**User Story:** As a Zotero user, I want to preview how Zotero items map to this library, so that I can correct issues before importing.

#### Acceptance Criteria

1. WHEN Zotero data is scanned THEN the system SHALL extract regular items, title, creators, abstract note, DOI, URL, publication title, date/year, collections, tags, and local PDF attachments when available.
2. WHEN unsupported Zotero item types are encountered THEN the system SHALL include them in a skipped or warning list with a reason.
3. WHEN local attachment files are missing THEN the system SHALL keep the metadata candidate and show a missing-attachment warning.
4. WHEN candidates are previewed THEN the UI SHALL allow filtering by collection, tag, attachment status, duplicate status, and warning status.
5. WHEN metadata is incomplete THEN the candidate SHALL remain selectable unless required fields are missing.

### Requirement 10: Zotero Deduplication and Import Confirmation

**User Story:** As a Zotero user, I want duplicates detected before import, so that importing does not pollute my library.

#### Acceptance Criteria

1. WHEN preview candidates are built THEN the system SHALL compare them against existing papers by DOI, normalized title, URL, and attachment filename where available.
2. IF a candidate is a likely duplicate THEN the system SHALL default it to not selected.
3. WHEN the user confirms import THEN the system SHALL import only selected candidates.
4. WHEN importing a candidate with an accessible PDF attachment THEN the system SHALL reuse existing storage import behavior and create a paper record linked to the stored PDF.
5. WHEN importing a metadata-only candidate THEN the system SHALL create a paper record with empty or unavailable PDF state only if the user explicitly allows metadata-only imports.

### Requirement 11: Zotero Import Audit and Incremental Runs

**User Story:** As a Zotero user, I want import runs to be recorded, so that I know what was imported and can retry failures.

#### Acceptance Criteria

1. WHEN a Zotero scan starts THEN the system SHALL create an import run record with source fingerprint, status, timestamps, and counts.
2. WHEN import completes THEN the run SHALL record imported, skipped, duplicate, warning, and failed counts.
3. IF a candidate fails during import THEN the system SHALL record the candidate id, title, reason, and whether retry is possible.
4. WHEN the same Zotero source is scanned again THEN previously imported candidates SHALL be recognized through stored source keys and duplicate checks.
5. WHEN the user opens an import run THEN the UI SHALL show a readable report without exposing absolute source paths by default.

### Requirement 12: Frontend Experience and Accessibility

**User Story:** As a research user, I want Agent and Zotero workflows to be clear and keyboard-accessible, so that I can safely review complex operations.

#### Acceptance Criteria

1. WHEN Agent proposals are shown THEN each approve, reject, expand, and revert control SHALL have an accessible name.
2. WHEN Zotero candidates are listed THEN row selection, filters, warning details, and final confirmation SHALL be keyboard reachable.
3. WHEN an operation is loading THEN the UI SHALL show progress and prevent duplicate submissions.
4. WHEN an operation fails THEN the UI SHALL show the actionable error and preserve entered form state.
5. The UI SHALL remain usable at 375px, 768px, 1024px, and 1440px widths.

## Non-Functional Requirements

### Code Architecture and Modularity

- Agent and Zotero routes SHALL live in separate route modules, not in the already-large `papers.py`.
- Agent and Zotero schemas SHALL live in separate schema modules.
- Agent and Zotero persistence models SHALL be additive and imported by model metadata initialization.
- Services SHALL encapsulate business logic; React components SHALL call typed API wrappers rather than direct `fetch`.
- New files SHOULD remain under 300 lines where practical; large UI surfaces SHOULD be split into hooks, utilities, and presentational components.

### Performance

- Agent read-only tool results SHALL be bounded by record count and text length.
- Zotero preview SHALL handle at least 1,000 Zotero items without blocking the UI indefinitely.
- Zotero scan/import SHOULD use the existing task queue or an equivalent progress mechanism for long-running work.
- Frontend lists SHOULD provide filters and concise summaries before rendering large detail payloads.

### Security

- All new API endpoints SHALL use the existing authenticated route protection.
- The frontend SHALL NOT receive API keys, local PDF paths, raw Zotero absolute paths by default, or unbounded model/tool payloads.
- Agent prompts SHALL NOT accept arbitrary frontend-supplied system prompts.
- Zotero source paths SHALL be validated and read-only; the original Zotero database SHALL never be opened for write.
- Destructive actions are out of Phase 4 scope.

### Reliability

- Agent run failures SHALL not corrupt paper/category state.
- Zotero candidate parsing SHALL tolerate malformed individual records and continue scanning other candidates.
- Import failures SHALL be recorded per candidate.
- Additive migrations SHALL preserve existing Phase 1/2/3 papers, blocks, translations, notes, and categories.
- Existing library, reader, block translation, daily briefing, recommendation, and legacy assistant behavior SHALL continue to pass targeted regression tests.

### Usability

- Agent and Zotero UI SHALL be data-dense operational workspaces, not landing pages.
- Every form control SHALL have a visible or accessible label.
- Confirmation surfaces SHALL show before/after values for Agent writes and duplicate/warning status for Zotero imports.
- Audit and import reports SHALL be readable without inspecting server logs.
