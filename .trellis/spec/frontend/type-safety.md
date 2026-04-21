# Type Safety

> Type safety patterns in this project.

---

## Overview

The frontend uses TypeScript with strict mode enabled.

Evidence:

- `frontend/tsconfig.json` sets `"strict": true`

Type safety is present and useful, but still pragmatic rather than maximalist. The project relies on:

- explicit shared domain types
- typed API helper return values
- typed component props
- limited runtime validation on the frontend

---

## Type Organization

Current organization:

- shared app/domain types live in `frontend/src/types.ts`
- API-specific response interfaces often live next to the API helpers in `frontend/src/lib/api.ts`
- component-local props are usually typed inline when simple

Examples:

- `frontend/src/types.ts`
  - `Paper`, `PaperDetail`, `Category`, `AutomationSettings`, `DailyBriefingSnapshot`
- `frontend/src/lib/api.ts`
  - `TaskStatusResponse`, `ChatSessionResponse`, `RecommendationItem`
- `frontend/src/components/SummaryCard.tsx`
  - inline typed props for a small presentational component

Guidelines:

- put reusable domain types in `types.ts`
- keep one-off API payload/response types near the API helper when they are not broadly shared
- keep small component-only prop types local to the component

---

## Validation

There is no dedicated frontend runtime validation library such as Zod or Yup in the current codebase.

Current validation style is lightweight and imperative:

- HTML input constraints and `accept` attributes
- local checks before submit
- backend error messages surfaced to the UI

Examples:

- `frontend/src/components/ImportForm.tsx`
  - validates PDF selection before submit
- `frontend/src/components/LoginPage.tsx`
  - prevents empty password submission
- `frontend/src/lib/api.ts`
  - centralizes backend error parsing through `readJson()` and `ensureOk()`

When adding new validation, keep it simple unless the workflow genuinely needs a schema validator.

---

## Common Patterns

Observed patterns worth following:

- use `import type` for type-only imports
  - example: `frontend/src/lib/api.ts`
- type API helper return values explicitly
  - example: `fetchPapers(): Promise<Paper[]>`
- use union literals for constrained UI state
  - examples: theme state in `App.tsx`, `CategoryScope` in `types.ts`
- use explicit nullable types where absence is real
  - examples: `number | null`, optional fields in `types.ts`

---

## Forbidden Patterns

Avoid these unless there is no practical alternative:

- `any`
- broad type assertions to silence compiler errors
- duplicating the same domain type in several files
- hiding nullable/optional behavior behind inaccurate non-null types

Current rough edge to avoid copying:

- `const payload: any = { content }` in `frontend/src/lib/api.ts`

If you must temporarily escape the type system, keep the escape local and replace it quickly.

---

## Common Mistakes

- Re-declaring API/domain shapes instead of importing from `types.ts`.
- Using `Record<string, unknown>` where a real response type is known.
- Letting `any` spread from one API helper into multiple components.
- Assuming backend payloads are always valid without at least handling null/error cases.
