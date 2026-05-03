# Project Hardening Fix Plan

## Goal

Fix the 10 optimization issues identified in the project audit while keeping the current MVP behavior and API shape as stable as possible.

## Scope

- Backend FastAPI configuration, auth, task status, routing hygiene, and safety boundaries
- Frontend API wrapper and task polling safety
- Project hygiene files and environment examples
- Focused tests for behavior changes
- No dependency upgrades unless required for a specific fix

## Repair Plan Table

| ID | Issue | Risk | Fix Strategy | Files | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Docker/env config missing `SERVER_BASE_URL`, `APP_PASSWORD`, `JWT_SECRET`, `EMBEDDING_MODEL_PATH` | Docker behavior diverges from local `.env` | Add missing vars to `.env.example` and `docker-compose.yml`; document defaults | `.env.example`, `docker-compose.yml` | Config smoke/read review | complete |
| 2 | Background tasks can swallow exceptions and report completed | UI may show parse/summary/embed success after real failure | Let task functions re-raise after pipeline failure; add regression test | `backend/app/api/routes/papers.py`, backend tests | Pytest targeted task failure test | complete |
| 3 | Auth fail-open defaults and weak secret behavior | Public deployment may expose APIs | Add production-safety validation and fail-closed frontend auth initialization | `backend/app/core/auth.py`, `backend/app/core/config.py`, `frontend/src/components/AuthContext.tsx` | Backend auth tests + frontend tests | complete |
| 4 | Markdown `rehype-raw` renders unsanitized HTML | XSS/content injection risk | Remove raw HTML rendering unless a sanitizer is present; preserve math/GFM | `frontend/src/components/PaperDetail.tsx`, `frontend/src/components/AiAssistantShell.tsx`, `frontend/package.json` if needed | Frontend tests/build | complete |
| 5 | `papers.py` too large, duplicated `/embed`, duplicated semantic search | Routing ambiguity and maintenance cost | Remove duplicate route definitions and consolidate to one semantic path without broad refactor | `backend/app/api/routes/papers.py` | Backend route tests | complete |
| 6 | Schema migration/status modeling is ad hoc | Future DB changes and statuses are fragile | Introduce status constants and safer migration helper boundaries; avoid Alembic in this small pass | `backend/app/models/paper.py`, `backend/app/core/db.py`, service usage if needed | Existing backend tests | complete |
| 7 | AI calls are synchronous in high-frequency GET endpoints | Slow pages and repeated API cost | Add deterministic fallback/cache guard where practical; avoid changing UX contracts | `backend/app/api/routes/briefing.py`, `backend/app/api/routes/recommendations.py` | Backend endpoint tests or smoke | complete |
| 8 | Vector search loads all JSON embeddings and has two APIs | Slow at scale, inconsistent API | Keep simple SQLite approach but consolidate implementation and avoid duplicate API behavior | `backend/app/api/routes/papers.py`, `backend/app/models/paper_embedding.py` | Backend semantic route tests | complete |
| 9 | `.gitignore`/`.dockerignore` miss generated and runtime artifacts | Huge searches, accidental data/secret inclusion | Add root and service ignore patterns for data, logs, env, venv, pycache, dist, node_modules | `.gitignore`, `.dockerignore`, `backend/.dockerignore`, `frontend/.dockerignore` | File review | complete |
| 10 | Frontend `App.tsx` and API polling responsibilities are tangled | Harder testing and future changes | Move task polling into `frontend/src/lib/api.ts`; keep broader component split for later | `frontend/src/App.tsx`, `frontend/src/lib/api.ts` | Frontend tests/build | complete |

## Phases

1. [complete] Write and sync the repair plan table
2. [complete] Add failing regression tests for high-risk behavior
3. [complete] Implement backend safety/config/task/routing fixes
4. [complete] Implement frontend markdown/auth/API polling fixes
5. [complete] Add project hygiene ignore files and env examples
6. [complete] Run targeted and broad verification

## Decisions

- Keep the pass scoped: fix concrete defects and hygiene issues without a full architecture rewrite.
- Do not introduce Celery/Redis, Alembic, FAISS, or a major frontend state library in this pass.
- Treat public deployment as a possible future target, so defaults should be explicit and safer.
- Use tests first for behavior changes; config and ignore-file edits are verified by review/build.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| PowerShell profile prints missing `OpenSpecCompletion.ps1` warning | Shell startup | Non-blocking environment noise; continue with command outputs |
| `pytest -q` collected `backend/test_api.py` and attempted a real network call at import time | Backend broad verification | Added pytest `testpaths = ["tests"]` in `backend/pyproject.toml` |
| Backend broad tests returned 500 for protected routes because local `.env` auth settings leaked into tests | Backend broad verification | Test `conftest.py` now explicitly isolates `APP_PASSWORD` and `JWT_SECRET` |
| Existing backend tests assumed parse/summarize background tasks completed synchronously | Backend broad verification | Added a shared task polling fixture and updated affected tests to wait for `completed` |

---

# Workbench Reading Experience Refresh Plan

## Goal

Improve the 工作看板 page so long daily reports are easier to scan, the right sidebar shows clear priority groups instead of repeated cards, and the top/side navigation has a stronger action hierarchy.

## Scope

- Frontend-only changes for the `/briefing` 工作看板 route
- Keep the existing data contract from `DailyBriefingSnapshot`
- Add lightweight UI state only where needed for collapsing sections and reading anchors
- Update focused React tests for the new visible structure
- Do not touch backend routes, schemas, persistence, or automation behavior

## UI Refresh Plan Table

| ID | Issue | Risk | Fix Strategy | Files | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UI-1 | Right sidebar has too many visually similar cards | Important suggestions, risks, and references are hard to distinguish | Group sidebar into key suggestions, risks, references, and next steps; default top papers show 3 with an expand control | `DailyBriefingShell.tsx`, `BriefingTopPapers.tsx`, `index.css`, `App.test.tsx` | Vitest 工作看板 test | complete |
| UI-2 | Long report lacks section navigation | Readers lose position in long markdown | Extract markdown headings into a sticky document outline with anchor links | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Vitest checks outline and anchor links | complete |
| UI-3 | Text/card hierarchy is too flat in dark mode | Dense page feels noisy and tiring | Increase report heading/paragraph contrast, distinct card levels, stronger blockquote emphasis | `index.css` | App tests passed; build blocked by unrelated `RecommendationShell.tsx` type issue | complete |
| UI-4 | Top area has scattered actions | Primary action is unclear | Rename and style primary action as `生成报告`, move secondary status into compact meta | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Vitest checks primary button | complete |
| UI-5 | Left nav selected state is weak | Current module is not obvious during long reading | Strengthen active nav bar/background and add module label | `App.tsx`, `index.css`, `App.test.tsx` | Existing navigation tests + focused assertion | complete |
| UI-6 | Scroll marker meaning is unclear | Users may confuse markers with errors/comments | Add an in-page marker legend and anchor jump affordances based on outline/risk/reference groups | `DailyBriefingShell.tsx`, `index.css` | Vitest checks legend copy | complete |

## UI Refresh Phases

1. [complete] Restore existing plan/findings/progress and locate 工作看板 implementation
2. [complete] Add focused tests for new hierarchy, outline, primary action, and sidebar grouping
3. [complete] Implement component structure and local UI state
4. [complete] Tune CSS for dark contrast, card hierarchy, nav state, and responsive behavior
5. [complete] Run targeted frontend verification and record results

## Follow-up Polish Plan

| ID | Issue | Fix Strategy | Files | Verification | Status |
| --- | --- | --- | --- | --- | --- |
| UI-7 | Fonts feel too heavy for long reading | Use readable sans-serif for report body, outline, right-card descriptions, and secondary UI copy; keep ranks/headings stronger | `index.css` | Full App Vitest | complete |
| UI-8 | Highlight card is large but low-density | Add keyword, risk level, read-order summary, and anchors into the highlight panel | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Daily briefing focused test | complete |
| UI-9 | Outline hierarchy needs stronger level distinction | Add title hover, two-line clamp, top-level weight, second-level indentation, and active vertical bar | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Daily briefing focused test | complete |
| UI-10 | Right suggestions should read like decisions | Add recommended action, audience fit, reason, and lighter related-topic chips | `BriefingTopPapers.tsx`, `index.css`, `App.test.tsx` | Daily briefing focused test | complete |
| UI-11 | Right column competes with main report | Shift grid ratio toward main content, reduce side padding, and keep cards compact | `index.css` | Full App Vitest | complete |
| UI-12 | Marker colors still need explicit meaning | Add four-color marker legend and active marker state | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Daily briefing focused test | complete |
| UI-13 | Top-to-report rhythm is too loose | Tighten highlight/main-header/stats spacing so content starts sooner | `index.css` | Visual review via CSS and tests | complete |
| UI-14 | Page title needs system status | Add filtered-paper/project/source counts, last generated time, and reading progress | `DailyBriefingShell.tsx`, `index.css`, `App.test.tsx` | Daily briefing focused test | complete |

## UI Refresh Decisions

- Keep the work on the existing `DailyBriefingShell` route instead of introducing a new page or route.
- Use semantic `nav`, `aside`, `section`, `details`, and `button` elements for accessibility.
- Derive outline entries from markdown heading lines; no new markdown parsing dependency.
- Use anchors for section jumps and a sticky outline/marker rail as the scroll-position aid.
- Default the right-side top paper list to 3 items, with a visible expand/collapse button for the rest.
- Keep the follow-up pass frontend-only and do not touch backend contracts or the existing `RecommendationShell.tsx` build blocker.
# PaperQuay Integration Spec Plan

## Goal

Prepare PRD, requirements, and a pre-development questionnaire for gradually replacing the current “论文管理” experience with a PaperQuay-inspired literature library while preserving the current FastAPI + React application.

## Scope

- Documentation only in this pass.
- Create a requirements questionnaire with 100-500 fill-in questions.
- Create PRD and requirements/spec drafts.
- No application code changes before the questionnaire and requirements are reviewed.

## Phase Table

| ID | Phase | Output | Status |
| --- | --- | --- | --- |
| PQ-1 | Gather current project and PaperQuay context | Findings recorded in `findings.md` | complete |
| PQ-2 | Create requirements questionnaire | `.spec-workflow/specs/paperquay-integration/requirements-questionnaire.md` | complete |
| PQ-3 | Create PRD | `.spec-workflow/specs/paperquay-integration/prd.md` | complete |
| PQ-4 | Create requirements/spec draft | `.spec-workflow/specs/paperquay-integration/requirements.md` and `technical-spec-draft.md` | complete |
| PQ-5 | User review and questionnaire completion | Awaiting user input | pending |
| PQ-6 | Revise requirements/design after answers | `design.md` created and awaiting approval | in_progress |
| PQ-7 | Create implementation tasks only after approval | `.spec-workflow/specs/paperquay-integration/tasks.md` | pending |

## Decisions

- Use option 2: adapt PaperQuay concepts into the existing app instead of switching the whole project to Tauri/Rust.
- Treat direct PaperQuay source reuse as blocked until AGPL implications are explicitly approved.
- Do not start coding until P0/P1 questionnaire answers are captured and requirements/design are approved.
- Requirements approval `approval_1777794616007_s8idfuhxg` was approved and deleted on 2026-05-03.
- Design approval `approval_1777797111834_7pugbqinq` is pending; tasks and implementation remain blocked until it is approved and deleted.

---
