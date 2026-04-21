# Directory Structure

> How frontend code is organized in this project.

---

## Overview

The frontend is a React + TypeScript + Vite SPA under `frontend/src/`.

This codebase is organized in a simple app-shell style rather than a strict feature-folder architecture:

- `App.tsx` owns the main routes and app-level shared state
- `components/` contains both page-level shells and smaller UI pieces
- `lib/` contains shared API access code
- `types.ts` contains shared frontend domain types
- `test/` contains frontend test setup
- `index.css` contains the global design system and component styling

There is no dedicated `pages/`, `hooks/`, or `store/` directory yet.

---

## Directory Layout

```text
frontend/src/
├── App.tsx
├── index.css
├── main.tsx
├── types.ts
├── components/
├── lib/
└── test/
```

Concrete examples:

- `frontend/src/App.tsx`
  - top-level routes and shared library refresh logic
- `frontend/src/components/PaperManagementPage.tsx`
  - page-level feature shell for paper import/list/detail/actions
- `frontend/src/components/DailyBriefingShell.tsx`
  - feature shell for daily briefing UI
- `frontend/src/lib/api.ts`
  - centralized HTTP access layer
- `frontend/src/test/setup.ts`
  - global Vitest setup

---

## Module Organization

Use the current structure as the default:

1. Put page-sized or workflow-sized UI in `components/`.
   - Examples: `PaperManagementPage.tsx`, `SubscriptionPage.tsx`, `AiAssistantShell.tsx`

2. Put reusable but still project-specific UI in `components/` too.
   - Examples: `SummaryCard.tsx`, `PaperList.tsx`, `PaperActions.tsx`, `FeedbackBanner.tsx`

3. Put shared HTTP/data-access logic in `lib/`.
   - Example: `frontend/src/lib/api.ts`

4. Put shared domain types in `types.ts` unless a type is strictly local to one file.

5. Keep styling centralized in `index.css`.
   - This project currently uses global classes and CSS custom properties, not CSS modules or Tailwind.

If a new area truly needs many related files, it is acceptable to add a subfolder under `components/`, but do that only after the flat structure becomes painful.

---

## Naming Conventions

Observed conventions:

- React component files use PascalCase.
  - Examples: `PaperDetail.tsx`, `RecommendationShell.tsx`, `AutomationSettingsPanel.tsx`
- App-level route shell files often end with `Shell` or `Page`.
  - Examples: `DailyBriefingShell.tsx`, `AiAssistantShell.tsx`, `PaperManagementPage.tsx`
- Utility modules use lower-case file names.
  - Example: `lib/api.ts`
- Shared type file is `types.ts`.
- Test files live next to their area with `.test.ts` / `.test.tsx`.
  - Examples: `App.test.tsx`, `lib/api.test.ts`

Keep using these names instead of introducing multiple competing naming schemes.

---

## Examples

Good structure examples in this repo:

1. `frontend/src/App.tsx`
   - central route wiring
   - app-level state only where needed by multiple views

2. `frontend/src/lib/api.ts`
   - keeps fetch/auth/error handling out of components

3. `frontend/src/components/SummaryCard.tsx`
   - focused reusable UI component with small props surface

---

## Anti-Patterns To Avoid

- Creating a second API layer inside components.
- Adding a global store directory before there is a real need.
- Spreading shared types across many unrelated files when `types.ts` is enough.
- Introducing CSS modules or a component library style system for one-off changes; the current codebase uses global CSS.

---

## Common Mistakes

- Putting too much logic into one feature component.
  - Existing large examples such as `PaperManagementPage.tsx` and `AiAssistantShell.tsx` are working code, but they should be treated as upper bounds, not ideals.
- Duplicating fetch or auth handling instead of reusing `lib/api.ts` and `AuthContext.tsx`.
- Adding ad hoc cache/state in random files without deciding whether it belongs in local state, context, or API helpers.
