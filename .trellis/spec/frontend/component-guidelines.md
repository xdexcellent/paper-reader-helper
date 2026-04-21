# Component Guidelines

> How components are built in this project.

---

## Overview

Frontend components in this project follow a pragmatic React pattern:

- page-level components own async behavior and local UI state
- small reusable components stay presentational
- props are typed inline or with local interfaces
- styling is applied through shared global CSS classes from `index.css`

There is no formal design-system package or headless component abstraction layer.

---

## Component Structure

Two common component shapes exist in this repo.

### 1. Feature shell / page component

These components:

- fetch or refresh data
- own loading/error/success state
- coordinate child components
- may sync with router params

Examples:

- `frontend/src/components/PaperManagementPage.tsx`
- `frontend/src/components/DailyBriefingShell.tsx`
- `frontend/src/components/AiAssistantShell.tsx`
- `frontend/src/components/RecommendationShell.tsx`

### 2. Focused presentational component

These components:

- take a narrow props surface
- render one clear UI area
- avoid fetch logic

Examples:

- `frontend/src/components/SummaryCard.tsx`
- `frontend/src/components/PaperList.tsx`
- `frontend/src/components/PaperActions.tsx`
- `frontend/src/components/FeedbackBanner.tsx`

When adding a new component, prefer the smallest shape that still matches the current architecture.

---

## Props Conventions

Observed props patterns:

- props are strongly typed
- small components often type props inline
- larger components may use local interfaces or imported domain types
- callbacks are passed down explicitly from parents

Examples:

- inline typed props in `frontend/src/components/SummaryCard.tsx`
- imported domain types in `frontend/src/components/PaperManagementPage.tsx`
- auth context type contracts in `frontend/src/components/AuthContext.tsx`

Guidelines:

- use explicit prop types
- prefer project domain types from `frontend/src/types.ts` when the prop shape matches API/domain data
- keep prop names descriptive and action-oriented, for example `refreshLibrary`, `onSubmit`, `setTheme`
- avoid passing giant untyped object bags

---

## Styling Patterns

Current styling system:

- global CSS in `frontend/src/index.css`
- CSS custom properties for theme tokens
- semantic class names applied directly in JSX
- theme switching through `data-theme` on `document.documentElement`

Examples:

- theme token definitions in `frontend/src/index.css`
- class-based styling in `frontend/src/App.tsx`
- form and card styling used by `frontend/src/components/ImportForm.tsx` and `frontend/src/components/SummaryCard.tsx`

Do not assume Tailwind, CSS modules, or styled-components.

---

## Accessibility

Accessibility is basic but present in several places:

- labeled navigation with `aria-label`
- hidden decorative icons use `aria-hidden="true"`
- file input has `aria-label="PDF 文件"`
- buttons use real `<button>` elements for interactive actions

Examples:

- `frontend/src/App.tsx`
- `frontend/src/components/ImportForm.tsx`
- `frontend/src/components/LoginPage.tsx`

Guidelines:

- prefer semantic elements before ARIA workarounds
- ensure clickable actions use buttons or links, not generic divs
- keep existing Chinese user-facing labels clear and action-oriented

Note: some current code still uses clickable containers, for example cards in `RecommendationShell.tsx`. Treat that as technical debt, not the preferred pattern.

---

## Common Mistakes

- Letting a shell component grow until it mixes routing, fetching, polling, mutations, and rendering in one file.
- Adding component-local fetch code when `lib/api.ts` already has the needed call.
- Repeating prop shapes instead of reusing `Paper`, `Category`, or related shared types.
- Using non-semantic clickable containers without keyboard/accessibility handling.
- Introducing inline visual styling for new work when a shared class would be more consistent.

---

## Anti-Patterns To Avoid

- Generic wrapper components with no real reuse value.
- New UI abstractions that fight the current simple component model.
- Mixing data fetching, low-level fetch construction, and rendering in the same child component when `lib/api.ts` already centralizes network access.
- Copying the largest feature components as the default pattern for small work.
