# Project Hardening Findings

## Existing Context

- Backend is FastAPI + SQLModel + SQLite with route modules under `backend/app/api/routes`.
- Frontend is React 18 + Vite with global app routing in `frontend/src/App.tsx`.
- Tests exist for core backend paper import/parse/summary/upload and frontend app navigation.
- The root directory is not currently a Git repository in this environment, so git-based status/review commands are unavailable.

## Audit Findings To Fix

- `backend/app/core/config.py` includes `server_base_url`, `jwt_secret`, `app_password`, and `embedding_model_path`, but `.env.example` and `docker-compose.yml` do not fully expose them.
- `backend/app/core/auth.py` skips auth entirely when `APP_PASSWORD` is empty and uses a default JWT secret.
- `frontend/src/components/AuthContext.tsx` treats auth status request failure as authenticated/no-password.
- `backend/app/services/task_queue.py` marks a task failed only if the submitted function raises; route closures in `papers.py` log and swallow exceptions.
- `frontend/src/components/PaperDetail.tsx` and `frontend/src/components/AiAssistantShell.tsx` use `rehypeRaw`.
- `backend/app/api/routes/papers.py` is large and contains duplicated `/{paper_id}/embed` routes and duplicated semantic search implementations.
- `backend/app/core/db.py` uses `create_all` plus a narrow manual migration helper.
- `briefing.py` and `recommendations.py` may call AI synchronously from GET endpoints.
- Semantic search reads all embeddings and calculates similarity in process; acceptable for MVP but duplicated and should be consolidated.
- Root `.gitignore` only ignores `.ace-tool/`; generated/runtime files are currently visible to search and packaging.
- `frontend/src/App.tsx` directly implements task polling and raw API URL/header logic already handled by `frontend/src/lib/api.ts`.

## Constraints

- Do not remove local user data or runtime artifacts in this pass.
- Do not add heavy infrastructure unless the current bug requires it.
- Do not expose real secrets from `backend/.env`; use examples only.

---

# Workbench UI Refresh Findings

## Existing Context

- `/briefing` 工作看板 is implemented by `frontend/src/components/DailyBriefingShell.tsx`.
- The right-side paper ranking cards are in `frontend/src/components/BriefingTopPapers.tsx`.
- Related project content is currently hidden behind `frontend/src/components/BriefingProjectsSidebar.tsx`.
- Global navigation lives in `frontend/src/App.tsx`; active state already exists but can be made more visible with CSS.
- The relevant styles are concentrated in `frontend/src/index.css`, especially the `.briefing-*` section.
- Existing tests for 工作看板 are in `frontend/src/App.test.tsx` and already mock `fetchBriefing`, history, automation status, and top papers.

## Design Inputs

- User requested grouping, default 3-5 important right-side items, priority labels, weaker repetitive meta, document outline/anchors, stronger typography hierarchy, focused top action, stronger left navigation, explained scroll markers, dark-mode contrast, differentiated card levels, and next-step actions.
- `ui-ux-pro-max` design-system lookup recommended high-contrast dark dashboard styling, visible focus states, semantic React controls, and avoiding noisy repeated decorative cards.

## Constraints

- ACE semantic indexing failed because `backend/.pytest_tmp` cannot be scanned (`EPERM`); subsequent code lookup used `rg` and direct file reads.
- Worktree already contains many unrelated modified/deleted files, including existing edits to frontend files; this pass must only change the 工作看板-related files needed for the request.

## Implementation Findings

- The existing briefing data already contains enough structure to create useful UI grouping without backend changes: `top_papers`, `projects`, `failed_items`, automation run status, history, and markdown headings.
- Markdown paper links can be converted to internal `/paper/:id` navigation by matching canonical URLs, PDF URLs, titles, and paper sources against the current paper/top-paper lookup.
- Right-side risk messages now appear both in the top feedback area and the grouped `风险点` panel by design; tests should use `getAllByText` for duplicated risk summaries.
- `SubscriptionPage` still uses raw `fetch` outside the mocked `lib/api` layer; App-level tests that navigate to `/subscribe` must mock that request or it can dispatch a delayed unauthorized event from a local backend.
- The full frontend build is currently blocked by an unrelated `RecommendationShell.tsx` type mismatch around `Paper.updated_at`; the 工作看板-specific Vitest coverage passes.
# PaperQuay Integration Findings

## Current Project Context

- Current project is FastAPI + SQLModel + SQLite backend and React/Vite frontend.
- Current paper management entry is `frontend/src/components/PaperManagementPage.tsx`.
- Current global routes for paper management are `/` and `/paper/:paperId` in `frontend/src/App.tsx`.
- Current frontend API wrapper is `frontend/src/lib/api.ts`.
- Current backend paper API is concentrated in `backend/app/api/routes/papers.py`.
- Current paper-related models include `Paper`, `PaperContent`, `PaperSummary`, and `PaperEmbedding`.
- ACE semantic search failed on `backend/.pytest_tmp` EPERM, so context was gathered with direct file reads and exact search.

## PaperQuay Public Reference Findings

- PaperQuay repository: https://github.com/WangQrkkk/PaperQuay
- PaperQuay positions itself as a desktop-first AI-assisted literature manager for PDF reading, translation, paper overviews, and Agent workflows.
- Public README describes these major capabilities: local SQLite library, PDF import confirmation, configurable storage, categories, tags, metadata editing, search/filtering, notes, annotations, PDF reader, MinerU block views, full-text/block translation, structured paper overview, Agent tool operations, Zotero import, and light/dark themes.
- Public README describes its architecture as Tauri 2 + React/TypeScript frontend + Rust commands + SQLite.
- PaperQuay license is AGPL-3.0-only, so source-level reuse needs explicit compliance review.

## UI/UX Findings

- `ui-ux-pro-max` recommended a data-dense dashboard pattern, accessible React queries, typed handlers, labeled controls, visible focus states, and smooth interactions.
- Its generated purple/orange palette is not adopted directly because the project rules discourage one-note purple themes and the current product already has a dark research-workbench style.

## Product Decision

- Recommended integration path is concept adaptation into the current stack, not direct embedding or full desktop pivot.
- First pass should be documentation and requirement constraints only.

---
