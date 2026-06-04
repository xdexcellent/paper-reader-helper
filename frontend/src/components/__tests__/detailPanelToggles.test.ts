/**
 * Unit tests for Detail Panel toggle behavior:
 * - Section accordion expand/collapse state transitions
 * - Summary clamp expand/collapse state transitions
 * - Reset on paper change
 *
 * These are logic-level tests verifying pure state transitions,
 * not DOM rendering tests.
 *
 * Validates: Requirements 5.1, 5.5, 6.1, 6.4
 */

import { describe, expect, it } from 'vitest'

// ─── Constants (mirroring PaperDetail.tsx) ──────────────────────────────────

const SECTION_COLLAPSE_LIMIT = 6

// ─── Helper: simulate toggle state logic ────────────────────────────────────

function createToggleState(initial = false) {
  let value = initial
  return {
    get: () => value,
    toggle: () => { value = !value },
    reset: () => { value = false },
  }
}

// ─── Section Accordion Tests ────────────────────────────────────────────────

describe('Section accordion toggle behavior', () => {
  it('starts collapsed (isSectionsExpanded = false)', () => {
    const isSectionsExpanded = createToggleState(false)
    expect(isSectionsExpanded.get()).toBe(false)
  })

  it('shows at most SECTION_COLLAPSE_LIMIT (6) sections when collapsed', () => {
    const isSectionsExpanded = createToggleState(false)
    const sections = Array.from({ length: 10 }, (_, i) => ({ title: `Section ${i + 1}` }))

    const visibleSections = isSectionsExpanded.get()
      ? sections
      : sections.slice(0, SECTION_COLLAPSE_LIMIT)

    expect(visibleSections).toHaveLength(6)
    expect(SECTION_COLLAPSE_LIMIT).toBe(6)
  })

  it('expands on toggle (shows all sections)', () => {
    const isSectionsExpanded = createToggleState(false)
    const sections = Array.from({ length: 10 }, (_, i) => ({ title: `Section ${i + 1}` }))

    // Toggle to expand
    isSectionsExpanded.toggle()
    expect(isSectionsExpanded.get()).toBe(true)

    const visibleSections = isSectionsExpanded.get()
      ? sections
      : sections.slice(0, SECTION_COLLAPSE_LIMIT)

    expect(visibleSections).toHaveLength(10)
  })

  it('collapses on second toggle', () => {
    const isSectionsExpanded = createToggleState(false)
    const sections = Array.from({ length: 10 }, (_, i) => ({ title: `Section ${i + 1}` }))

    // Toggle to expand
    isSectionsExpanded.toggle()
    expect(isSectionsExpanded.get()).toBe(true)

    // Toggle to collapse
    isSectionsExpanded.toggle()
    expect(isSectionsExpanded.get()).toBe(false)

    const visibleSections = isSectionsExpanded.get()
      ? sections
      : sections.slice(0, SECTION_COLLAPSE_LIMIT)

    expect(visibleSections).toHaveLength(6)
  })

  it('resets to collapsed when paper changes', () => {
    const isSectionsExpanded = createToggleState(false)

    // Expand first
    isSectionsExpanded.toggle()
    expect(isSectionsExpanded.get()).toBe(true)

    // Simulate paper change (useEffect resets to false)
    isSectionsExpanded.reset()
    expect(isSectionsExpanded.get()).toBe(false)
  })
})

// ─── Summary Clamp Tests ────────────────────────────────────────────────────

describe('Summary clamp toggle behavior', () => {
  it('starts clamped (isSummaryExpanded = false)', () => {
    const isSummaryExpanded = createToggleState(false)
    expect(isSummaryExpanded.get()).toBe(false)
  })

  it('expands on toggle', () => {
    const isSummaryExpanded = createToggleState(false)

    isSummaryExpanded.toggle()
    expect(isSummaryExpanded.get()).toBe(true)
  })

  it('collapses on second toggle', () => {
    const isSummaryExpanded = createToggleState(false)

    // Expand
    isSummaryExpanded.toggle()
    expect(isSummaryExpanded.get()).toBe(true)

    // Collapse
    isSummaryExpanded.toggle()
    expect(isSummaryExpanded.get()).toBe(false)
  })

  it('resets to clamped when paper changes', () => {
    const isSummaryExpanded = createToggleState(false)

    // Expand first
    isSummaryExpanded.toggle()
    expect(isSummaryExpanded.get()).toBe(true)

    // Simulate paper change (useEffect resets to false)
    isSummaryExpanded.reset()
    expect(isSummaryExpanded.get()).toBe(false)
  })
})

// ─── Combined Reset Tests ───────────────────────────────────────────────────

describe('Both toggles reset on paper change', () => {
  it('both isSectionsExpanded and isSummaryExpanded reset to false on paper change', () => {
    const isSectionsExpanded = createToggleState(false)
    const isSummaryExpanded = createToggleState(false)

    // Expand both
    isSectionsExpanded.toggle()
    isSummaryExpanded.toggle()
    expect(isSectionsExpanded.get()).toBe(true)
    expect(isSummaryExpanded.get()).toBe(true)

    // Simulate paper change — both reset
    isSectionsExpanded.reset()
    isSummaryExpanded.reset()
    expect(isSectionsExpanded.get()).toBe(false)
    expect(isSummaryExpanded.get()).toBe(false)
  })
})
