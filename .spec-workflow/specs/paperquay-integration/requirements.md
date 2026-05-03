# Requirements Document

## Introduction

This feature replaces the current paper management experience with a PaperQuay-inspired literature library workflow while preserving the existing FastAPI + React/Vite application and its current paper processing capabilities.

The integration is intentionally incremental. PaperQuay is a Tauri desktop application with React, Rust commands, and SQLite persistence; this project remains a Web application with FastAPI, SQLModel, SQLite, and Vite unless a later approved phase changes that direction.

## Alignment with Product Vision

The existing product already focuses on paper ingestion, MinerU parsing, AI summaries, embeddings, daily briefings, recommendations, and paper-aware chat. A PaperQuay-style literature library strengthens the missing management layer: metadata confirmation, library organization, reader workflow, overview fields, translation, Agent operations, and optional Zotero import.

## Scope Rules

- The first implementation phase shall preserve existing paper APIs unless a migration is explicitly approved.
- The first implementation phase shall not directly copy PaperQuay source code unless AGPL compliance is explicitly approved.
- All implementation shall be blocked until the requirements questionnaire has enough answers to freeze P0/P1 decisions.

## Requirements

### Requirement 1: Integration Mode

**User Story:** As the product owner, I want PaperQuay capabilities integrated gradually into the current app, so that existing subscriptions, daily briefings, recommendations, and AI workflows remain usable.

#### Acceptance Criteria

1. WHEN the integration is implemented THEN the system SHALL keep the current FastAPI backend as the primary API layer.
2. WHEN the library UI replaces current paper management THEN the system SHALL continue to support existing `/papers` workflows.
3. IF a PaperQuay feature depends on Tauri/Rust THEN the system SHALL provide a Web/FastAPI equivalent or defer the feature.
4. IF source-level PaperQuay reuse is proposed THEN the implementation SHALL stop until AGPL obligations are documented and approved.

### Requirement 2: Library Workspace

**User Story:** As a researcher, I want a library-first workspace, so that I can manage papers before deciding what to read.

#### Acceptance Criteria

1. WHEN the user opens paper management THEN the system SHALL show a library workspace with category navigation, paper list, and detail/action area.
2. WHEN no paper is selected THEN the system SHALL show useful library-level stats, onboarding, or import actions.
3. WHEN a paper is selected THEN the system SHALL show metadata, processing status, categories, tags, and available actions.
4. IF the library is loading THEN the system SHALL show a non-blocking loading state.

### Requirement 3: Import Confirmation

**User Story:** As a researcher, I want to confirm metadata before a PDF enters the library, so that imported papers are clean and searchable.

#### Acceptance Criteria

1. WHEN the user chooses or drops a PDF THEN the system SHALL open an import confirmation flow before final library insertion, unless the user has explicitly enabled quick import.
2. WHEN metadata extraction succeeds THEN the system SHALL prefill title and any available metadata.
3. IF metadata extraction fails THEN the system SHALL allow manual title entry and continue import.
4. IF a duplicate is detected THEN the system SHALL warn the user before insertion.

### Requirement 4: Metadata Model

**User Story:** As a researcher, I want richer paper metadata, so that I can filter, cite, and organize papers accurately.

#### Acceptance Criteria

1. WHEN a paper detail is displayed THEN the system SHALL support title, authors, year, venue, DOI, URL, abstract, source, and local PDF path as target metadata fields.
2. WHEN metadata fields are not yet stored in the current schema THEN the system SHALL either map to existing fields or mark them as pending schema work.
3. IF metadata is edited THEN the system SHALL validate required fields and preserve existing processing status.
4. IF schema migration is required THEN the system SHALL include a migration and rollback/backup strategy.

### Requirement 5: File Management

**User Story:** As a user with local PDFs, I want predictable file handling, so that imports do not lose or duplicate important files unexpectedly.

#### Acceptance Criteria

1. WHEN importing a PDF THEN the system SHALL use an approved file handling mode: copy, move, or keep-path.
2. WHEN a stored PDF is missing THEN the system SHALL show a clear file-missing state.
3. WHEN deleting a paper THEN the system SHALL confirm whether associated files should also be deleted.
4. IF file storage settings are configurable THEN changes SHALL not break existing file links without confirmation.

### Requirement 6: Categories and Collections

**User Story:** As a researcher, I want categories or collections, so that my literature library reflects research topics and projects.

#### Acceptance Criteria

1. WHEN categories are displayed THEN the system SHALL preserve current active categories and pending buckets.
2. WHEN tree categories are approved THEN the system SHALL support parent-child relationships in UI and storage.
3. WHEN assigning a paper to a category THEN the system SHALL update the list and detail views consistently.
4. IF multi-category membership is approved THEN the system SHALL not overload `primary_category_id` without a migration plan.

### Requirement 7: Tags, Notes, Favorites, and Reading State

**User Story:** As a reader, I want lightweight personal organization fields, so that I can track what matters beyond categories.

#### Acceptance Criteria

1. WHEN tags are enabled THEN the system SHALL allow viewing and editing tags from paper detail.
2. WHEN favorites are enabled THEN the system SHALL show favorite state in the list and detail.
3. WHEN reading state is enabled THEN the system SHALL support unread, reading, read, and skipped states or an approved equivalent.
4. IF notes are enabled THEN notes SHALL be saved separately from AI-generated summaries.

### Requirement 8: Search and Filtering

**User Story:** As a researcher with many papers, I want fast search and filters, so that I can find relevant papers quickly.

#### Acceptance Criteria

1. WHEN the user searches THEN the system SHALL search at least title and source in Phase 1.
2. WHEN filters are available THEN the system SHALL support status and category filters using existing data.
3. IF tags, authors, year, or full-text search are enabled THEN the system SHALL define exact fields and performance targets.
4. IF semantic search remains available THEN it SHALL be reachable from the new library workflow.

### Requirement 9: Reader Shell

**User Story:** As a reader, I want to open papers from the library into a focused reader, so that management and reading are connected.

#### Acceptance Criteria

1. WHEN the user opens a paper THEN the system SHALL provide a reader entry from the library detail.
2. WHEN PDF viewing is available THEN the system SHALL use the existing authenticated `/papers/{id}/pdf` route or an approved replacement.
3. WHEN Markdown content is available THEN the system SHALL provide readable markdown rendering.
4. IF PDF fails to load THEN the system SHALL show a recoverable error without crashing the library.

### Requirement 10: MinerU Structured Blocks

**User Story:** As a user of AI-assisted reading, I want MinerU blocks preserved, so that translation and PDF-region linkage can work later.

#### Acceptance Criteria

1. WHEN parsing completes THEN the system SHALL continue storing readable markdown content.
2. IF structured blocks are approved THEN the system SHALL store block order, type, page, text, and location metadata.
3. WHEN block storage is unavailable THEN the system SHALL degrade to markdown reading.
4. IF parse state becomes stale THEN the system SHALL recover or mark failure using current task recovery patterns.

### Requirement 11: Paper Overview

**User Story:** As a researcher screening papers, I want structured overview fields, so that I can decide whether to read deeply.

#### Acceptance Criteria

1. WHEN summary generation completes THEN the system SHALL show a paper overview in the new detail panel.
2. WHEN PaperQuay-style overview fields are approved THEN the system SHALL include background, research question, method, experiment setup, findings, conclusion, and limitations.
3. IF existing summary fields are retained THEN the system SHALL map them clearly to the overview UI.
4. IF overview generation fails THEN the paper SHALL remain readable and retryable.

### Requirement 12: Translation

**User Story:** As a non-native reader, I want translation that does not interrupt reading, so that I can keep source context while understanding hard passages.

#### Acceptance Criteria

1. IF translation is in Phase 1 THEN the system SHALL define whether it supports selection translation, block translation, or full-text translation.
2. WHEN translation is cached THEN the system SHALL link translations to source paper and block/selection.
3. IF translation fails THEN the system SHALL keep original text visible.
4. IF multiple models are allowed THEN the system SHALL persist model and endpoint metadata for generated translations.

### Requirement 13: Agent Workspace

**User Story:** As a researcher managing a library, I want an Agent that can assist with library operations, so that repetitive cleanup work is faster but still controlled.

#### Acceptance Criteria

1. IF Agent operations are enabled THEN the system SHALL distinguish chat-only responses from tool operations.
2. WHEN an Agent proposes a destructive or batch operation THEN the system SHALL require human confirmation.
3. WHEN an Agent executes a tool THEN the system SHALL show execution trace and result.
4. IF an operation fails partially THEN the system SHALL report what changed and what did not.

### Requirement 14: Zotero Import

**User Story:** As an existing Zotero user, I want optional Zotero import, so that I can reuse my current library.

#### Acceptance Criteria

1. IF Zotero import is enabled THEN the system SHALL read from a copied temporary database, not mutate the original `zotero.sqlite`.
2. WHEN Zotero collections are imported THEN the system SHALL map them to approved local categories or collections.
3. WHEN Zotero tags are imported THEN the system SHALL preserve or map them according to approved tag rules.
4. IF attachments are missing THEN the system SHALL include them in the import report.

### Requirement 15: Existing Feature Preservation

**User Story:** As an existing user, I want current workflows to keep working, so that the replacement does not break my daily process.

#### Acceptance Criteria

1. WHEN the new library is enabled THEN daily briefing links SHALL still open the correct paper.
2. WHEN recommendations link to a paper THEN the system SHALL open the new detail or reader route.
3. WHEN subscriptions import papers THEN they SHALL appear in the new library.
4. IF a legacy route remains necessary THEN it SHALL redirect or render the new experience consistently.

### Requirement 16: Security and Privacy

**User Story:** As a user storing local research files and API keys, I want safe defaults, so that private data is not exposed accidentally.

#### Acceptance Criteria

1. WHEN API requests access paper data THEN existing authentication SHALL remain enforced.
2. WHEN model or MinerU keys are configured THEN they SHALL not be exposed to frontend code.
3. WHEN local paths are displayed THEN the UI SHALL avoid leaking sensitive paths unless explicitly needed.
4. WHEN deleting, moving, or batch-editing records THEN the system SHALL require confirmation.

### Requirement 17: Performance and Scale

**User Story:** As a user with a growing library, I want the app to remain responsive, so that library management does not become tedious.

#### Acceptance Criteria

1. WHEN the library has the approved target number of papers THEN list rendering SHALL remain usable.
2. IF target scale exceeds current simple list performance THEN the design SHALL include pagination or virtualization.
3. WHEN background tasks run THEN the UI SHALL remain interactive.
4. IF search indexes are rebuilding THEN the system SHALL show progress or degraded-mode status.

### Requirement 18: Testing and Verification

**User Story:** As the maintainer, I want focused tests for the replacement, so that regressions are caught during the migration.

#### Acceptance Criteria

1. WHEN Phase 1 is implemented THEN frontend tests SHALL cover library shell, import confirmation, selection, and paper actions.
2. WHEN backend schema/API changes are implemented THEN backend tests SHALL cover migration and route compatibility.
3. WHEN PDF/reader behavior changes THEN smoke tests SHALL verify opening an existing paper.
4. IF key verification cannot run THEN completion status SHALL explicitly say what was not verified.

## Non-Functional Requirements

### Code Architecture and Modularity

- Each new frontend module should have one clear concern: library shell, category tree, paper table/list, import confirmation, paper metadata panel, reader entry, or overview panel.
- Backend route growth should avoid expanding the already large `papers.py` file; new concerns should be split into focused route/service modules when practical.
- Data migrations should be explicit and tested.

### Performance

- Phase 1 should remain responsive for the questionnaire-approved target library size.
- Rendering large lists should use stable dimensions and avoid layout shift.
- Background tasks must not block browsing and reading.

### Security

- Continue authenticated API access.
- Do not hardcode API keys.
- Treat local file paths and PDFs as private data.
- Include AGPL compliance review before any PaperQuay source reuse.

### Reliability

- Import, parse, summarize, and embed failures should be visible and retryable.
- Existing data must be backed up before schema migration if migration is required.
- Parse failures must not prevent PDF reading.

### Usability

- The UI should be dense, scannable, and work-focused.
- Controls must use clear labels, accessible names, visible focus states, and keyboard-reachable interactions.
- No implementation should start until the P0/P1 questionnaire is filled enough to remove major ambiguity.

