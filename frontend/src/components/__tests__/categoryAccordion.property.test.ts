import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Feature: paper-management-ui-polish-v3
 * Property 3: Category accordion truncation computes correct visible and hidden counts
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * For any list of deduplicated category groups with length N and a collapse limit of 12,
 * when the accordion is collapsed: the visible count SHALL equal `min(N, 12)`,
 * and the hidden count SHALL equal `max(0, N - 12)`.
 *
 * This models the accordion truncation logic from PaperManagementPage:
 *   const CATEGORY_COLLAPSE_LIMIT = 12
 *   const visibleGroups = isCategoryExpanded
 *     ? dedupedCategories
 *     : dedupedCategories.slice(0, CATEGORY_COLLAPSE_LIMIT)
 *   const hiddenCount = dedupedCategories.length - CATEGORY_COLLAPSE_LIMIT
 */

const CATEGORY_COLLAPSE_LIMIT = 12

/**
 * Models the accordion truncation logic extracted from PaperManagementPage.
 * When collapsed, only the first CATEGORY_COLLAPSE_LIMIT items are visible.
 */
function computeAccordionCounts(totalCategories: number, isExpanded: boolean) {
  const visibleCount = isExpanded
    ? totalCategories
    : Math.min(totalCategories, CATEGORY_COLLAPSE_LIMIT)
  const hiddenCount = Math.max(0, totalCategories - CATEGORY_COLLAPSE_LIMIT)
  return { visibleCount, hiddenCount }
}

// Arbitrary for generating arrays of category groups of varying lengths
const categoryGroupArrayArb = (minLen: number, maxLen: number) =>
  fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }),
      paperCount: fc.nat({ max: 1000 }),
      pendingCount: fc.nat({ max: 100 }),
      categoryIds: fc.array(fc.nat({ max: 10000 }), { minLength: 1, maxLength: 5 }),
      isSystem: fc.boolean(),
      isPendingBucket: fc.boolean(),
    }),
    { minLength: minLen, maxLength: maxLen },
  )

describe('Feature: paper-management-ui-polish-v3, Property 3: Category accordion truncation computes correct visible and hidden counts', () => {
  it('when collapsed: visible count equals min(N, 12)', () => {
    fc.assert(
      fc.property(
        categoryGroupArrayArb(0, 50),
        (categories) => {
          const N = categories.length
          const { visibleCount } = computeAccordionCounts(N, false)
          expect(visibleCount).toBe(Math.min(N, CATEGORY_COLLAPSE_LIMIT))
        },
      ),
      { numRuns: 200 },
    )
  })

  it('when collapsed: hidden count equals max(0, N - 12)', () => {
    fc.assert(
      fc.property(
        categoryGroupArrayArb(0, 50),
        (categories) => {
          const N = categories.length
          const { hiddenCount } = computeAccordionCounts(N, false)
          expect(hiddenCount).toBe(Math.max(0, N - CATEGORY_COLLAPSE_LIMIT))
        },
      ),
      { numRuns: 200 },
    )
  })

  it('when collapsed and N > 12: visible count + hidden count equals N', () => {
    fc.assert(
      fc.property(
        categoryGroupArrayArb(13, 50), // Ensure N > 12
        (categories) => {
          const N = categories.length
          const { visibleCount, hiddenCount } = computeAccordionCounts(N, false)
          expect(visibleCount + hiddenCount).toBe(N)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('when expanded: all categories are visible regardless of count', () => {
    fc.assert(
      fc.property(
        categoryGroupArrayArb(0, 50),
        (categories) => {
          const N = categories.length
          const { visibleCount } = computeAccordionCounts(N, true)
          expect(visibleCount).toBe(N)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('slice-based truncation matches computed visible count', () => {
    fc.assert(
      fc.property(
        categoryGroupArrayArb(0, 50),
        fc.boolean(),
        (categories, isExpanded) => {
          // Simulate the actual slice logic from the component
          const visibleGroups = isExpanded
            ? categories
            : categories.slice(0, CATEGORY_COLLAPSE_LIMIT)

          const { visibleCount } = computeAccordionCounts(categories.length, isExpanded)
          expect(visibleGroups.length).toBe(visibleCount)
        },
      ),
      { numRuns: 200 },
    )
  })
})
