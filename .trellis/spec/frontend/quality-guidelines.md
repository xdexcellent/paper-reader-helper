# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend quality is built around a simple stack:

- React 18 + TypeScript + Vite
- strict TypeScript: `frontend/tsconfig.json`
- Vitest + Testing Library + jsdom: `frontend/package.json`, `frontend/src/test/setup.ts`

There is no committed ESLint or Prettier config at the moment, so consistency with the existing codebase matters more than tool-specific rules.

---

## Forbidden Patterns

Do not introduce these patterns:

- direct `fetch(...)` calls spread across components when `frontend/src/lib/api.ts` should own the request
- unnecessary global state libraries
- untyped payload construction with `any`
- duplicated auth-expiry handling instead of using `UNAUTHORIZED_EVENT` and `AuthContext`
- new styling systems that conflict with the current global-CSS approach
- clickable non-semantic containers for core interactions without keyboard/accessibility handling

Current rough edges to avoid copying:

- module-level cache in `frontend/src/components/RecommendationShell.tsx`
- `any` payload construction in `frontend/src/lib/api.ts`

---

## Required Patterns

Prefer these patterns:

- centralize network access in `frontend/src/lib/api.ts`
- keep user-facing loading/error/success state explicit in components
- type props and API returns clearly
- reuse shared domain types from `frontend/src/types.ts`
- use semantic HTML elements and explicit labels where possible
- keep theme and shared library state in the current app-level places instead of inventing parallel state paths

Examples to follow:

- `frontend/src/lib/api.ts`
- `frontend/src/components/AuthContext.tsx`
- `frontend/src/components/ImportForm.tsx`
- `frontend/src/components/SummaryCard.tsx`

---

## Testing Requirements

Frontend behavior is tested with Vitest and Testing Library.

Examples:

- `frontend/src/App.test.tsx`
  - route transitions, auth behavior, async UI flows, library refresh behavior
- `frontend/src/lib/api.test.ts`
  - API wrapper behavior and unauthorized event dispatch
- `frontend/src/test/setup.ts`
  - global test matchers

Expectations:

- add or update tests when changing shared API helpers
- add UI tests for non-trivial user workflows
- cover auth/session behavior carefully because the app depends on token state and unauthorized events
- prefer user-observable assertions over implementation details

---

## Code Review Checklist

Reviewers should check:

- Is network access still centralized in `lib/api.ts`?
- Are props and state typed clearly?
- Does the change preserve the current global CSS and theming model?
- Are loading, error, and success states visible and honest?
- Does the UI remain accessible enough for buttons, forms, and navigation?
- Is there a test for new non-trivial behavior?
- Did the change duplicate logic already present in `AuthContext`, `App.tsx`, or an existing component?

---

## Common Mistakes

- Growing feature shells until they become hard to reason about.
- Refreshing one piece of state but forgetting another dependent view.
- Leaving stale detail content on screen after selection changes or failed loads.
- Duplicating backend response types in components.
- Adding new visual patterns that do not match `index.css` tokens and classes.
