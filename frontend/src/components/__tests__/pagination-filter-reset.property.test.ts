import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Feature: paper-management-ui-alignment-v2
 * Property 2: Filter changes reset pagination to page 1
 *
 * **Validates: Requirements 3.7**
 *
 * For any pagination state with currentPage > 1, when the search query or
 * active tag filter changes, the resulting currentPage SHALL be 1.
 *
 * This models the behavior of the useEffect in PaperManagementPage:
 *   useEffect(() => { setCurrentPage(1) }, [searchQuery, activeTag])
 *
 * The test simulates the state machine:
 * 1. Start with an arbitrary currentPage > 1
 * 2. Apply a filter change event (searchQuery change or activeTag change)
 * 3. Assert that the resulting currentPage is always 1
 */

/**
 * Models the pagination reset logic extracted from PaperManagementPage.
 * When searchQuery or activeTag changes, currentPage resets to 1.
 */
function applyFilterChange(
  state: { currentPage: number; searchQuery: string; activeTag: string | null },
  event: { type: 'searchQuery'; value: string } | { type: 'activeTag'; value: string | null },
): { currentPage: number; searchQuery: string; activeTag: string | null } {
  const newState = { ...state }

  if (event.type === 'searchQuery') {
    if (event.value !== state.searchQuery) {
      newState.searchQuery = event.value
      newState.currentPage = 1 // Reset on filter change
    }
  } else if (event.type === 'activeTag') {
    if (event.value !== state.activeTag) {
      newState.activeTag = event.value
      newState.currentPage = 1 // Reset on filter change
    }
  }

  return newState
}

describe('Feature: paper-management-ui-alignment-v2, Property 2: Filter changes reset pagination to page 1', () => {
  // Arbitrary for a search query change event that differs from the current value
  const searchQueryChangeArb = (currentQuery: string) =>
    fc.string({ minLength: 0, maxLength: 50 }).filter((v) => v !== currentQuery)

  // Arbitrary for a tag change event that differs from the current value
  const activeTagChangeArb = (currentTag: string | null) =>
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 30 }).map((s): string | null => s),
      fc.constant(null as string | null),
    ).filter((v) => v !== currentTag)

  it('searchQuery change resets currentPage to 1 regardless of current page', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }), // currentPage > 1
        fc.string({ minLength: 0, maxLength: 50 }), // initial searchQuery
        fc.string({ minLength: 0, maxLength: 50 }), // initial activeTag or null
        fc.string({ minLength: 0, maxLength: 50 }), // new searchQuery (will be filtered to differ)
        (currentPage, initialQuery, initialTag, newQuery) => {
          // Ensure the new query is different from the initial one
          fc.pre(newQuery !== initialQuery)

          const state = {
            currentPage,
            searchQuery: initialQuery,
            activeTag: initialTag as string | null,
          }

          const result = applyFilterChange(state, { type: 'searchQuery', value: newQuery })
          expect(result.currentPage).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('activeTag change resets currentPage to 1 regardless of current page', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }), // currentPage > 1
        fc.string({ minLength: 0, maxLength: 50 }), // initial searchQuery
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constant(null as string | null),
        ), // initial activeTag
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constant(null as string | null),
        ), // new activeTag
        (currentPage, initialQuery, initialTag, newTag) => {
          // Ensure the new tag is different from the initial one
          fc.pre(newTag !== initialTag)

          const state = {
            currentPage,
            searchQuery: initialQuery,
            activeTag: initialTag,
          }

          const result = applyFilterChange(state, { type: 'activeTag', value: newTag })
          expect(result.currentPage).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('any sequence of filter changes always results in currentPage === 1', () => {
    // Generate a sequence of filter change events
    const filterEventArb = fc.oneof(
      fc.string({ minLength: 0, maxLength: 50 }).map((v) => ({ type: 'searchQuery' as const, value: v })),
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 30 }).map((s): string | null => s),
        fc.constant(null as string | null),
      ).map((v) => ({ type: 'activeTag' as const, value: v })),
    )

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }), // initial currentPage > 1
        fc.string({ minLength: 0, maxLength: 50 }), // initial searchQuery
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constant(null as string | null),
        ), // initial activeTag
        fc.array(filterEventArb, { minLength: 1, maxLength: 10 }), // sequence of filter events
        (currentPage, initialQuery, initialTag, events) => {
          let state = {
            currentPage,
            searchQuery: initialQuery,
            activeTag: initialTag,
          }

          // Apply events; at least one must actually change a filter value
          let anyChanged = false
          for (const event of events) {
            const prevState = { ...state }
            state = applyFilterChange(state, event)
            if (
              state.searchQuery !== prevState.searchQuery ||
              state.activeTag !== prevState.activeTag
            ) {
              anyChanged = true
            }
          }

          // If at least one filter actually changed, currentPage must be 1
          if (anyChanged) {
            expect(state.currentPage).toBe(1)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('no-op filter change (same value) does NOT reset currentPage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }), // currentPage > 1
        fc.string({ minLength: 0, maxLength: 50 }), // searchQuery
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constant(null as string | null),
        ), // activeTag
        (currentPage, query, tag) => {
          const state = { currentPage, searchQuery: query, activeTag: tag }

          // Applying the same searchQuery should not reset
          const afterSameSearch = applyFilterChange(state, { type: 'searchQuery', value: query })
          expect(afterSameSearch.currentPage).toBe(currentPage)

          // Applying the same activeTag should not reset
          const afterSameTag = applyFilterChange(state, { type: 'activeTag', value: tag })
          expect(afterSameTag.currentPage).toBe(currentPage)
        },
      ),
      { numRuns: 100 },
    )
  })
})
