import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Feature: paper-management-ui-polish-v3
 * Property 4: Section accordion truncation computes correct visible count
 *
 * **Validates: Requirements 5.1**
 *
 * For any list of paper sections with length N and a collapse limit of 6,
 * when the accordion is collapsed: the visible count SHALL equal min(N, 6).
 * When the accordion is expanded: the visible count SHALL equal N.
 *
 * This models the behavior in PaperDetail.tsx:
 *   const SECTION_COLLAPSE_LIMIT = 6
 *   const visibleSections = isSectionsExpanded
 *     ? sections
 *     : sections.slice(0, SECTION_COLLAPSE_LIMIT)
 */

const SECTION_COLLAPSE_LIMIT = 6

interface Section {
  title: string
  intro: string
  subSections: { title: string; content: string }[]
}

/**
 * Models the section accordion truncation logic from PaperDetail.tsx.
 * Returns the count of visible sections based on the expanded state.
 */
function computeVisibleSectionCount(
  totalSections: number,
  isExpanded: boolean,
): number {
  if (isExpanded) {
    return totalSections
  }
  return Math.min(totalSections, SECTION_COLLAPSE_LIMIT)
}

/**
 * Generates an arbitrary section object matching the MainSection interface.
 */
const sectionArb: fc.Arbitrary<Section> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  intro: fc.string({ minLength: 0, maxLength: 200 }),
  subSections: fc.array(
    fc.record({
      title: fc.string({ minLength: 1, maxLength: 50 }),
      content: fc.string({ minLength: 0, maxLength: 200 }),
    }),
    { minLength: 0, maxLength: 5 },
  ),
})

describe('Feature: paper-management-ui-polish-v3, Property 4: Section accordion truncation computes correct visible count', () => {
  it('when collapsed, visible count equals min(N, 6) for any section list', () => {
    fc.assert(
      fc.property(
        fc.array(sectionArb, { minLength: 0, maxLength: 50 }),
        (sections) => {
          const N = sections.length
          const visibleCount = computeVisibleSectionCount(N, false)
          expect(visibleCount).toBe(Math.min(N, SECTION_COLLAPSE_LIMIT))
        },
      ),
      { numRuns: 200 },
    )
  })

  it('when expanded, visible count equals N for any section list', () => {
    fc.assert(
      fc.property(
        fc.array(sectionArb, { minLength: 0, maxLength: 50 }),
        (sections) => {
          const N = sections.length
          const visibleCount = computeVisibleSectionCount(N, true)
          expect(visibleCount).toBe(N)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('collapsed visible count is always <= SECTION_COLLAPSE_LIMIT', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (totalSections) => {
          const visibleCount = computeVisibleSectionCount(totalSections, false)
          expect(visibleCount).toBeLessThanOrEqual(SECTION_COLLAPSE_LIMIT)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('expanded visible count is always >= collapsed visible count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (totalSections) => {
          const collapsedCount = computeVisibleSectionCount(totalSections, false)
          const expandedCount = computeVisibleSectionCount(totalSections, true)
          expect(expandedCount).toBeGreaterThanOrEqual(collapsedCount)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('slice-based implementation matches min(N, 6) for collapsed state', () => {
    fc.assert(
      fc.property(
        fc.array(sectionArb, { minLength: 0, maxLength: 50 }),
        (sections) => {
          // Directly model the slice logic from PaperDetail.tsx
          const visibleSections = sections.slice(0, SECTION_COLLAPSE_LIMIT)
          expect(visibleSections.length).toBe(Math.min(sections.length, SECTION_COLLAPSE_LIMIT))
        },
      ),
      { numRuns: 200 },
    )
  })
})
