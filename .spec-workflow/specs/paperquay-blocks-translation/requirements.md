# Requirements Document

## Introduction

This spec implements PRD Phase 3 for the PaperQuay-inspired integration: MinerU structured block storage, reader-side block exploration, PDF page linkage, and explicit cached block translation. It continues the existing FastAPI + SQLModel + SQLite + React/Vite architecture and builds on the completed `paperquay-integration` and `paperquay-reader-metadata` specs.

Phase 4 capabilities from the PRD, including Agent library operations and Zotero import, are intentionally excluded from this spec and will be handled by later specs. Phase 3 must, however, preserve enough provenance for those later features to reuse block and translation data.

Reference constraints:
- MinerU structured output exposes content blocks with page indexes and bbox coordinates; coordinates are mapped to a 0-1000 range.
- Zotero Phase 4 must be read-only when it directly accesses `zotero.sqlite`; that is deferred from this Phase 3 spec.
- The current project already stores MinerU markdown output in `PaperContent` and exposes a PDF/Markdown reader route.

## Alignment with Product Vision

The PRD calls for a gradual PaperQuay-style literature management experience without switching to Tauri/Rust or copying AGPL source code. Phase 1 delivered the library workspace, and Phase 2 delivered metadata, notes, and the PDF/Markdown reader. Phase 3 adds the missing PaperQuay-style structured document layer:

- Preserve the current parse/summarize/embed pipeline.
- Turn MinerU structured output into a queryable local document layer.
- Let users inspect a paper by page, block type, and reading order.
- Add translation cache primitives that do not leak API keys or local paths.
- Keep failure modes recoverable so parsing or translation failures never block normal PDF/Markdown reading.

## Requirements

### Requirement 1: Structured Block Persistence

**User Story:** As a researcher, I want MinerU structured output stored as local block records, so that I can browse paper content by page, type, and layout position.

#### Acceptance Criteria

1. WHEN a paper parse returns structured MinerU content THEN the system SHALL persist block records linked to the paper.
2. WHEN a block is persisted THEN the system SHALL store paper id, page index, reading order, block type, text content when available, bbox coordinates when available, and source hash.
3. WHEN a block contains table, image, chart, formula, list, code, or unknown content THEN the system SHALL preserve a safe source representation for future rendering and debugging.
4. WHEN a paper is re-parsed THEN the system SHALL replace stale block records for that paper without deleting the paper, PDF, markdown, summary, embeddings, notes, favorite state, or reading state.
5. IF structured content is unavailable THEN the system SHALL keep the existing Markdown/PDF content and expose a no-blocks state instead of marking the whole paper unreadable.

### Requirement 2: Additive Database Migration

**User Story:** As a maintainer, I want block and translation tables added safely, so that existing user libraries are not damaged during upgrade.

#### Acceptance Criteria

1. WHEN an existing SQLite database starts after the migration THEN the system SHALL create the new block and translation tables without destructive schema changes.
2. WHEN existing papers have no block data THEN the system SHALL leave their parse, summary, embedding, metadata, notes, and reading state unchanged.
3. WHEN a paper is deleted THEN the system SHALL remove its associated block and translation records.
4. IF migration runs multiple times THEN the system SHALL remain idempotent.

### Requirement 3: Block Extraction from MinerU Results

**User Story:** As a researcher, I want existing MinerU results converted into normalized blocks, so that the reader can use structured content without a new parser.

#### Acceptance Criteria

1. WHEN MinerU returns a result ZIP or structured JSON URL/path THEN the system SHALL attempt to extract structured block data from it.
2. WHEN structured output follows MinerU pipeline-style or VLM-style block content THEN the system SHALL normalize supported fields into the same internal model.
3. WHEN structured output is malformed THEN the system SHALL record a recoverable block extraction error while preserving the paper parse result.
4. WHEN the user requests block rebuild for a parsed paper THEN the system SHALL rebuild blocks from stored parse artifacts if available.
5. IF no parse artifacts are available THEN the system SHALL return a clear 409-style error explaining that the paper must be parsed again.

### Requirement 4: Block API

**User Story:** As a frontend developer, I want typed APIs for paper blocks, so that the reader can query structured content predictably.

#### Acceptance Criteria

1. WHEN the frontend requests `GET /papers/{paper_id}/blocks` THEN the system SHALL return ordered block records for that paper.
2. WHEN query parameters include page, type, or search text THEN the system SHALL filter block results deterministically.
3. WHEN the paper does not exist THEN the system SHALL return 404.
4. WHEN the paper exists but has no blocks THEN the system SHALL return an empty list and a useful summary/status payload.
5. WHEN block records include source metadata THEN the API SHALL not expose unsafe local paths or unbounded raw source JSON by default.

### Requirement 5: Reader Block Workspace

**User Story:** As a researcher, I want a structured blocks view in the reader, so that I can scan figures, tables, formulas, and text without scrolling a long markdown document.

#### Acceptance Criteria

1. WHEN a paper has blocks THEN the reader SHALL provide a structured blocks surface reachable from the existing reader route.
2. WHEN the user filters by page, type, or search text THEN the reader SHALL update the block list without leaving the paper.
3. WHEN the user selects a block THEN the reader SHALL show its page index, type, content preview, translation state, and available actions.
4. WHEN the selected block has page information THEN the reader SHALL provide a page-level PDF navigation action.
5. IF precise bbox overlay is not available in the current iframe PDF viewer THEN the reader SHALL still offer page-level linkage and defer true overlay to a later implementation.

### Requirement 6: Translation Cache

**User Story:** As a bilingual researcher, I want explicit block translation with caching, so that I can translate important parts once and reuse the result later.

#### Acceptance Criteria

1. WHEN the user requests a block translation THEN the system SHALL translate server-side using the configured OpenAI-compatible model client.
2. WHEN a translation exists for the same block source hash, target language, model, and prompt version THEN the system SHALL return the cached translation without calling the model.
3. WHEN the source block changes after re-parse THEN previous translations SHALL be marked stale or bypassed by source hash mismatch.
4. WHEN a translation fails THEN the system SHALL preserve the original block content and expose a retryable error state.
5. WHEN a translation succeeds THEN the system SHALL store translated text, target language, model name, prompt version, source hash, status, and timestamps.

### Requirement 7: Translation API

**User Story:** As a frontend developer, I want typed translation endpoints, so that reader controls can request and display cached translations safely.

#### Acceptance Criteria

1. WHEN the frontend calls `POST /papers/{paper_id}/blocks/{block_id}/translate` THEN the system SHALL validate paper ownership by paper id and block id.
2. WHEN target language or model is omitted THEN the system SHALL use configured safe defaults.
3. WHEN `force_refresh` is false THEN the system SHALL prefer a successful cached translation.
4. WHEN `force_refresh` is true THEN the system SHALL request a new translation and preserve prior successful output until the new request succeeds.
5. IF the block has no translatable text THEN the system SHALL return a clear validation error without calling the model.

### Requirement 8: Translation UI

**User Story:** As a researcher, I want translation controls inside the block reader, so that I can translate only the sections I need.

#### Acceptance Criteria

1. WHEN a block is translatable THEN the UI SHALL show a labeled translate action.
2. WHEN a cached translation exists THEN the UI SHALL show it without requiring a new model call.
3. WHEN translation is loading THEN the UI SHALL keep the original content visible and show progress.
4. WHEN translation fails THEN the UI SHALL show a retry action and a safe error message.
5. WHEN translation is stale THEN the UI SHALL label it as stale and allow refresh.

### Requirement 9: Security and Privacy

**User Story:** As a user, I want structured parsing and translation to preserve privacy and application safety, so that sensitive local paths and credentials are not exposed.

#### Acceptance Criteria

1. WHEN block or translation endpoints are called THEN the system SHALL require existing authentication.
2. WHEN translation prompts are built THEN the system SHALL exclude API keys, local PDF paths, and user notes unless explicitly included by a later approved requirement.
3. WHEN block content contains HTML-like text THEN the frontend SHALL render it safely without unsanitized raw HTML execution.
4. WHEN logs are written THEN the system SHALL avoid logging full block content by default.
5. WHEN source JSON is stored THEN normal API responses SHALL expose only safe summarized fields unless a later debug/export endpoint is approved.

### Requirement 10: Phase 4 Handoff

**User Story:** As a future Agent or Zotero feature developer, I want Phase 3 data to include provenance, so that later tools can operate on blocks and translations safely.

#### Acceptance Criteria

1. WHEN blocks are stored THEN each block SHALL have stable identifiers and source hashes usable by later Agent actions.
2. WHEN translations are stored THEN each translation SHALL record enough metadata for audit and cache reuse.
3. WHEN Phase 3 ships THEN it SHALL not introduce Agent execution tools, bulk destructive operations, or Zotero import behavior.
4. WHEN Phase 4 begins THEN it SHALL use a separate spec with its own requirements, design, tasks, approval, and implementation logs.

## Non-Functional Requirements

### Code Architecture and Modularity

- New backend block and translation logic SHOULD live outside the already-large `papers.py` route where practical.
- Parsing/normalization code SHOULD be pure and fixture-testable.
- Frontend reader block components SHOULD remain presentational where possible and call API wrappers from `frontend/src/lib/api.ts`.
- Each implementation task SHOULD touch a small, explicit file set and record structured implementation logs.

### Performance

- `GET /papers/{paper_id}/blocks` SHOULD remain usable for at least 2,000 blocks per paper.
- The initial UI SHOULD avoid rendering unbounded full source JSON.
- Translation SHOULD be explicit and cached to avoid repeated model calls.

### Security

- All new endpoints MUST use existing authentication dependencies and server-side model credentials.
- Database access MUST use SQLModel/session patterns, not string-built SQL from user input.
- Block rendering MUST avoid unsanitized raw HTML.

### Reliability

- Block extraction failure MUST NOT mark the full paper parse as failed if markdown extraction succeeded.
- Translation failure MUST NOT hide original block content.
- Rebuild and translation retry actions MUST return actionable errors.

### Usability

- Reader block controls MUST have labels and keyboard-reachable actions.
- No-block, loading, stale, failed, and cached states MUST be visible.
- The UI SHOULD remain data-dense and consistent with the existing library/reader design, not a landing page.

## Sources

- PaperQuay PRD: `.spec-workflow/specs/paperquay-integration/prd.md`
- PaperQuay technical draft: `.spec-workflow/specs/paperquay-integration/technical-spec-draft.md`
- MinerU output format documentation: https://opendatalab.github.io/MinerU/reference/output_files/
- Zotero direct SQLite access documentation for Phase 4 boundary: https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access
