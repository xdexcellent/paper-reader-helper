# State Management

> How state is managed in this project.

---

## Overview

This project uses plain React state management:

- local state with `useState`
- derived state with `useMemo`
- effects and polling with `useEffect`
- cross-cutting auth state with React Context
- no Redux, Zustand, MobX, React Query, or SWR

This is a deliberate simple baseline. New work should default to local state unless there is a clear shared-state need.

---

## State Categories

### Local UI and workflow state

Most state stays local to the component that owns the interaction.

Examples:

- `frontend/src/components/PaperManagementPage.tsx`
  - selected paper
  - detail payload
  - loading flags
  - import dialog state
  - category form state
  - error/feedback messages
- `frontend/src/components/RecommendationShell.tsx`
  - recommendation loading and result state

### App-level shared state

A small amount of shared library state is lifted to `App.tsx`.

Examples:

- `frontend/src/App.tsx`
  - `papers`
  - `categories`
  - `theme`
  - `refreshLibrary()`

### Global cross-cutting state

Only auth is truly global right now.

Example:

- `frontend/src/components/AuthContext.tsx`

### Server state

Server state is fetched manually through `lib/api.ts` helpers and then stored in component state.

---

## When to Use Global State

Promote state upward only when:

- multiple routes or shells need the same current value
- one update should refresh several views
- the value represents cross-cutting session/application state

Current examples that justify shared/global state:

- auth state in `AuthContext.tsx`
- `papers` and `categories` in `App.tsx`

Do not promote state just to avoid prop drilling if the data only matters within one workflow.

---

## Server State

Current server-state strategy is manual:

- request data via `frontend/src/lib/api.ts`
- store results in component state
- refresh explicitly after mutations
- poll long-running tasks when needed

Examples:

- `frontend/src/lib/api.ts`
  - centralized task polling helper `waitForTaskCompletion(...)`
- `frontend/src/components/PaperManagementPage.tsx`
  - refreshes library and detail after mutations
  - polls detail while processing is still running
- `frontend/src/components/RecommendationShell.tsx`
  - uses a small module-level cache for one-minute recommendation reuse

The module-level cache in `RecommendationShell.tsx` works, but it is a project-specific shortcut, not the ideal default pattern.

---

## Common Mistakes

- Creating multiple disconnected copies of server state instead of refreshing from the shared source.
- Promoting state to context/store before there is a real cross-screen need.
- Using ad hoc module globals as caches.
  - Existing example: `frontend/src/components/RecommendationShell.tsx`
- Forgetting to clear stale detail state when switching entities.
  - `PaperManagementPage.tsx` already contains explicit guards for this.
- Mixing derived state into persisted state instead of using `useMemo`.

---

## Anti-Patterns To Avoid

- Introducing Redux/Zustand-style global state for a single screen workflow.
- Duplicating auth/session state outside `AuthContext.tsx`.
- Building a second server-state cache layer on top of existing direct fetch/refresh flows without a strong need.
- Hiding important refresh rules inside implicit side effects.
