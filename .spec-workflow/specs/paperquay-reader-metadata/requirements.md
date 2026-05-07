# Requirements Document

## Introduction

This feature continues the PaperQuay integration after the completed Phase 1 library shell. It adds the next layer of reader and library-management capability: persisted paper metadata, favorites, reading state, user notes, and a focused Reader shell with PDF/Markdown modes.

The feature remains Web-first on the existing FastAPI + SQLModel + SQLite backend and React/Vite frontend. It does not copy PaperQuay source code and does not introduce Tauri/Rust. MinerU structured blocks, translation cache, Agent operations, Zotero import, normalized author tables, and PDF annotations remain deferred to later specs.

## Alignment with Product Vision

The product already supports importing papers, parsing via MinerU, generating summaries, embeddings, daily briefings, recommendations, and paper-aware chat. Phase 1 replaced the paper-management entry with a PaperQuay-style library workspace. Phase 2 makes that workspace useful for real reading and personal organization by persisting richer metadata, tracking reading progress, and connecting library detail to a focused reader experience.

This phase is the lowest-risk next step because it builds directly on current models, API wrappers, and library components while avoiding the larger deferred systems that require new domain models.

## Requirements

### Requirement 1: Phase 2 Scope and Compatibility

**User Story:** As the product owner, I want the second PaperQuay phase to extend the completed library shell without destabilizing existing workflows, so that the project can keep shipping incrementally.

#### Acceptance Criteria

1. WHEN Phase 2 is implemented THEN the system SHALL keep the existing FastAPI backend, React/Vite frontend, authentication model, and current paper-processing routes.
2. WHEN a paper is opened from the library THEN the system SHALL preserve the existing `/paper/:paperId` library-detail behavior unless a reader entry is explicitly selected.
3. WHEN reader functionality is added THEN the system SHALL provide a dedicated reader route or route state that can be reached from the Phase 1 library detail panel.
4. IF a requested capability belongs to MinerU block persistence, translation, Agent tools, Zotero import, normalized multi-author storage, multi-category membership, or PDF annotations THEN the implementation SHALL defer it to a later approved spec.

### Requirement 2: Persisted Rich Metadata

**User Story:** As a researcher, I want to edit and persist key paper metadata, so that my library remains searchable and trustworthy after import.

#### Acceptance Criteria

1. WHEN paper detail is loaded THEN the system SHALL expose persisted metadata fields for title, authors, year, venue, DOI, URL, abstract, source, and local PDF availability.
2. WHEN the user edits metadata THEN the system SHALL validate required and typed fields before saving.
3. WHEN metadata is saved THEN the system SHALL preserve processing status, category, tags, summary, embeddings, and existing PDF links.
4. IF a metadata field is missing for existing papers THEN the system SHALL display an empty or derived value without crashing the list, detail panel, or reader.
5. IF schema changes are required THEN the implementation SHALL add SQLite-safe migration coverage for databases created before Phase 2.

### Requirement 3: Favorites

**User Story:** As a researcher, I want to mark important papers as favorites, so that I can return to priority papers quickly.

#### Acceptance Criteria

1. WHEN the user toggles favorite state THEN the system SHALL persist the new state for the paper.
2. WHEN a paper is favorited THEN the library list and metadata panel SHALL show the favorite state.
3. WHEN the library is filtered by favorites THEN only favorited papers SHALL be shown.
4. IF favorite update fails THEN the UI SHALL keep the previous state or show a recoverable error without losing the current selection.

### Requirement 4: Reading State and Progress

**User Story:** As a reader, I want to track whether a paper is unread, in progress, read, or skipped, so that I can manage a growing literature queue.

#### Acceptance Criteria

1. WHEN a paper is created or imported THEN its default reading state SHALL be `unread`.
2. WHEN the user changes reading state THEN the system SHALL persist one of `unread`, `reading`, `read`, or `skipped`.
3. WHEN a paper is opened in the reader THEN the system SHALL be able to mark the paper as `reading` without overwriting a manually set `read` or `skipped` state.
4. WHEN reading progress is stored THEN it SHALL be represented as an integer from 0 to 100.
5. IF reading state or progress update fails THEN the UI SHALL report the failure while preserving the current paper detail view.

### Requirement 5: User Notes

**User Story:** As a researcher, I want personal notes separate from AI summaries, so that my own reading observations are not mixed with generated content.

#### Acceptance Criteria

1. WHEN the user writes a note for a paper THEN the system SHALL persist it separately from generated summary fields.
2. WHEN paper detail or reader is loaded THEN the system SHALL display the current user note if one exists.
3. WHEN note saving fails THEN the UI SHALL keep the unsaved text visible and show a recoverable error.
4. IF notes are empty THEN the system SHALL handle them as an empty note state, not as missing paper data.
5. IF Markdown preview is not implemented in this phase THEN note editing SHALL still be usable as plain text.

### Requirement 6: Reader Shell

**User Story:** As a reader, I want a focused paper reader connected to the library, so that I can switch between PDF and parsed Markdown without leaving the paper context.

#### Acceptance Criteria

1. WHEN the user selects Open reader from library detail THEN the system SHALL open the selected paper in a focused reader experience.
2. WHEN a paper has a stored PDF THEN the reader SHALL load it through the existing authenticated `/papers/{id}/pdf` route or the existing frontend blob helper.
3. WHEN parsed Markdown exists THEN the reader SHALL provide a readable Markdown mode with heading navigation or an equivalent table of contents.
4. WHEN both PDF and Markdown are available THEN the reader SHALL allow switching between them without losing the selected paper context.
5. IF PDF loading fails THEN the reader SHALL show a retryable error state and keep metadata/Markdown visible when available.
6. IF Markdown content is missing THEN the reader SHALL show a parse-needed state with a clear next action.

### Requirement 7: Library Integration

**User Story:** As a library user, I want metadata, favorites, reading state, and reader entry points integrated into the existing library shell, so that I do not need separate disconnected tools.

#### Acceptance Criteria

1. WHEN the library list renders THEN it SHALL surface favorite and reading-state indicators without causing layout shift.
2. WHEN filters are available THEN the library SHALL support favorites and reading-state filters in addition to existing category/status/tag/search filters.
3. WHEN the metadata panel renders THEN it SHALL show editable metadata, favorite, reading state, tags, category, task status, and reader entry in a scannable layout.
4. WHEN daily briefing or recommendation links open `/paper/:paperId` THEN the system SHALL continue to show the library detail route and offer reader entry from there.

### Requirement 8: API and Data Contract

**User Story:** As a maintainer, I want clear API contracts for metadata and reading state updates, so that frontend behavior and backend persistence remain testable.

#### Acceptance Criteria

1. WHEN frontend code updates metadata, favorite, reading state, reading progress, or notes THEN it SHALL call typed API wrapper functions rather than constructing ad hoc fetch calls in components.
2. WHEN the backend accepts update payloads THEN it SHALL reject invalid reading states, invalid progress values, and malformed metadata fields.
3. WHEN list and detail responses are returned THEN they SHALL include the Phase 2 fields required by the library and reader UI.
4. IF existing API routes are extended THEN existing callers SHALL remain source-compatible.
5. IF a new route is added THEN it SHALL be covered by focused backend tests and documented in the implementation log.

### Requirement 9: Security, Privacy, and Safety

**User Story:** As a user storing local papers and notes, I want Phase 2 to preserve current privacy and safety guarantees, so that metadata and reading data are not exposed unexpectedly.

#### Acceptance Criteria

1. WHEN API requests access or modify Phase 2 paper fields THEN existing authentication SHALL remain enforced.
2. WHEN local PDF paths exist THEN the UI SHALL avoid displaying sensitive full local paths as primary user-facing text.
3. WHEN notes are saved THEN the system SHALL not send note contents to model APIs unless a later approved feature explicitly does so.
4. WHEN batch or destructive operations are not part of this phase THEN the implementation SHALL not add them incidentally.

### Requirement 10: Testing and Verification

**User Story:** As the maintainer, I want targeted tests around schema, API, route, and reader behavior, so that Phase 2 does not regress the completed library shell.

#### Acceptance Criteria

1. WHEN schema fields are added THEN backend migration tests SHALL prove an older database receives safe defaults.
2. WHEN metadata, favorite, reading state, progress, or notes are updated THEN backend tests SHALL cover successful and invalid payloads.
3. WHEN frontend API wrappers are added THEN unit tests SHALL verify request methods, URLs, and payload shapes.
4. WHEN the reader route is added THEN route-level frontend tests SHALL cover opening the reader, switching PDF/Markdown modes, PDF failure, and missing Markdown states.
5. WHEN Phase 2 is complete THEN the focused frontend tests, focused backend tests, and frontend production build SHALL be run and reported with exact results.

## Non-Functional Requirements

### Code Architecture and Modularity

- Reader UI SHALL be implemented in focused reader components rather than expanding `LibraryPage`.
- Metadata edit logic SHALL be isolated from list filtering logic.
- API wrappers SHALL remain the frontend integration boundary.
- Backend validation SHALL live in typed schemas and small service/helper functions where practical.
- Files modified for Phase 2 SHOULD remain under the project line limits in `AGENTS.md`.

### Performance

- Library list rendering SHALL remain responsive for the Phase 1 target scale.
- Favorite and reading-state filters SHALL reuse deterministic client-side helpers unless backend pagination/search is separately approved.
- Reader mode switches SHALL not repeatedly leak PDF blob URLs.

### Security

- Existing auth protections SHALL remain required for paper data, PDF access, metadata updates, notes, and reading state updates.
- API keys and local file paths SHALL not be exposed to frontend code beyond existing authenticated PDF retrieval.
- User notes SHALL be treated as private local data.

### Reliability

- Metadata, favorite, reading state, and note update failures SHALL be visible and recoverable.
- Existing papers created before Phase 2 SHALL load with default values.
- PDF failure SHALL not prevent Markdown reading when Markdown exists.
- Missing Markdown SHALL not prevent PDF reading when PDF exists.

### Usability

- Reader controls SHALL have accessible names and visible focus states.
- Metadata editing SHALL use explicit labels and clear save/error states.
- Favorites and reading states SHALL be visible but compact in dense library rows.
- Empty states SHALL explain what the user can do next without exposing implementation details.
