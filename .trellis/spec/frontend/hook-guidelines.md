# Hook Guidelines

> How hooks are used in this project.

---

## Overview

This frontend does not have a large custom-hook ecosystem.

Current reality:

- React built-in hooks are used heavily: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`
- The main custom hook pattern is context-backed auth access via `useAuth()`
- Data fetching is mostly done directly inside components rather than through reusable domain hooks

This means new hooks should be introduced only when they remove real duplication or clarify a repeated stateful workflow.

---

## Custom Hook Patterns

Current example:

- `frontend/src/components/AuthContext.tsx`
  - `useAuth()` reads a context and throws if used outside the provider

Pattern to follow when creating a custom hook:

1. the logic is stateful and reused in multiple places
2. the hook wraps a coherent concern
3. the hook returns a typed contract
4. the hook does not hide critical side effects in surprising ways

Good future candidates in this repo would be things like repeated polling or repeated task-execution flows, but only if they truly appear in multiple places.

---

## Data Fetching

Current data-fetching pattern:

- API calls are centralized in `frontend/src/lib/api.ts`
- components call those API helpers directly
- loading/error/success state is usually local to the component
- polling is implemented with `setInterval` or helper methods rather than React Query/SWR

Examples:

- `frontend/src/components/PaperManagementPage.tsx`
- `frontend/src/components/RecommendationShell.tsx`
- `frontend/src/lib/api.ts`

Guidelines:

- do not call `fetch(...)` directly from most components; add or reuse a helper in `lib/api.ts`
- keep request-specific loading/error state near the component that renders it
- if the same fetch/polling flow appears in 2-3 places, consider extracting a custom hook

---

## Naming Conventions

Observed conventions:

- hooks follow normal React `use*` naming
- hook-like helpers that enforce provider usage should throw early on misuse

Example:

- `frontend/src/components/AuthContext.tsx`
  - `useAuth()` throws when no provider is mounted

If you add a custom hook:

- start its name with `use`
- keep its return value typed
- colocate it near the owning concern unless there are multiple consumers

---

## Common Mistakes

- Creating a custom hook too early for logic that is only used once.
- Hiding network calls in many tiny hooks that become harder to trace than the current direct component pattern.
- Duplicating auth or unauthorized handling instead of reusing `useAuth()` and `UNAUTHORIZED_EVENT`.
- Forgetting that this project does not use React Query or another server-state hook library.

---

## Anti-Patterns To Avoid

- A hook for every fetch call without reuse.
- Hooks that return `any`-shaped state.
- Hooks that duplicate logic already centralized in `AuthContext.tsx` or `lib/api.ts`.
- Introducing a hook-based state architecture that is more complex than the current codebase needs.
