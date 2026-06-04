import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Feature: paper-management-ui-polish-v3
 * Property 2: Group selection filters papers by all merged category IDs
 *
 * **Validates: Requirements 1.3**
 *
 * For any set of papers and any selected CategoryGroup, the filtered paper list
 * SHALL contain exactly those papers whose primary_category_id is included in
 * the group's categoryIds array.
 *
 * This models the filtering logic from PaperManagementPage:
 *   papers.filter(paper => selectedGroupIds === null ||
 *     (paper.primary_category_id != null && selectedGroupIds.includes(paper.primary_category_id)))
 */

interface MinimalPaper {
  id: number
  primary_category_id: number | null
}

interface CategoryGroup {
  name: string
  categoryIds: number[]
}

/**
 * Models the group selection filtering logic extracted from PaperManagementPage.
 * When a group is selected, papers are filtered by all merged category IDs.
 */
function filterPapersByGroup(
  papers: MinimalPaper[],
  selectedGroupIds: number[] | null,
): MinimalPaper[] {
  if (selectedGroupIds === null) return papers
  return papers.filter(
    (paper) =>
      paper.primary_category_id != null &&
      selectedGroupIds.includes(paper.primary_category_id),
  )
}

// --- Arbitraries ---

/** Generates a minimal paper with a random primary_category_id (possibly null) */
const paperArb = (categoryPool: number[]): fc.Arbitrary<MinimalPaper> =>
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    primary_category_id: fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...categoryPool) },
      { weight: 1, arbitrary: fc.constant(null as number | null) },
    ),
  })

/** Generates a category group with a subset of category IDs from the pool */
const categoryGroupArb = (categoryPool: number[]): fc.Arbitrary<CategoryGroup> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    categoryIds: fc
      .subarray(categoryPool, { minLength: 1 })
      .map((ids) => [...new Set(ids)]),
  })

describe('Feature: paper-management-ui-polish-v3, Property 2: Group selection filters papers by all merged category IDs', () => {
  // A shared pool of category IDs to ensure overlap between papers and groups
  const categoryPoolArb = fc
    .array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 10 })
    .map((ids) => [...new Set(ids)])
    .filter((ids) => ids.length >= 2)

  it('filtered papers contain exactly those whose primary_category_id is in the group categoryIds', () => {
    fc.assert(
      fc.property(
        categoryPoolArb.chain((pool) =>
          fc.tuple(
            fc.array(paperArb(pool), { minLength: 0, maxLength: 50 }),
            categoryGroupArb(pool),
            fc.constant(pool),
          ),
        ),
        ([papers, group, _pool]) => {
          const result = filterPapersByGroup(papers, group.categoryIds)

          // Every paper in the result must have primary_category_id in group.categoryIds
          for (const paper of result) {
            expect(paper.primary_category_id).not.toBeNull()
            expect(group.categoryIds).toContain(paper.primary_category_id)
          }

          // Every paper NOT in the result must either have null primary_category_id
          // or a primary_category_id NOT in group.categoryIds
          const resultIds = new Set(result.map((p) => p.id))
          for (const paper of papers) {
            if (!resultIds.has(paper.id)) {
              const excluded =
                paper.primary_category_id === null ||
                !group.categoryIds.includes(paper.primary_category_id)
              expect(excluded).toBe(true)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('null selectedGroupIds returns all papers unfiltered', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            primary_category_id: fc.oneof(
              fc.integer({ min: 1, max: 50 }),
              fc.constant(null as number | null),
            ),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (papers) => {
          const result = filterPapersByGroup(papers, null)
          expect(result).toEqual(papers)
          expect(result.length).toBe(papers.length)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('papers with null primary_category_id are always excluded when a group is selected', () => {
    fc.assert(
      fc.property(
        categoryPoolArb.chain((pool) =>
          fc.tuple(
            fc.array(paperArb(pool), { minLength: 1, maxLength: 50 }),
            categoryGroupArb(pool),
          ),
        ),
        ([papers, group]) => {
          const result = filterPapersByGroup(papers, group.categoryIds)

          // No paper in the result should have null primary_category_id
          for (const paper of result) {
            expect(paper.primary_category_id).not.toBeNull()
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('result count equals the number of papers matching the group categoryIds', () => {
    fc.assert(
      fc.property(
        categoryPoolArb.chain((pool) =>
          fc.tuple(
            fc.array(paperArb(pool), { minLength: 0, maxLength: 50 }),
            categoryGroupArb(pool),
          ),
        ),
        ([papers, group]) => {
          const result = filterPapersByGroup(papers, group.categoryIds)

          const expectedCount = papers.filter(
            (p) =>
              p.primary_category_id !== null &&
              group.categoryIds.includes(p.primary_category_id),
          ).length

          expect(result.length).toBe(expectedCount)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('filtering preserves paper order from the original array', () => {
    fc.assert(
      fc.property(
        categoryPoolArb.chain((pool) =>
          fc.tuple(
            fc.array(paperArb(pool), { minLength: 0, maxLength: 50 }),
            categoryGroupArb(pool),
          ),
        ),
        ([papers, group]) => {
          const result = filterPapersByGroup(papers, group.categoryIds)

          // Verify order is preserved: indices in original array should be monotonically increasing
          const resultIndices = result.map((p) =>
            papers.findIndex((orig) => orig === p),
          )
          for (let i = 1; i < resultIndices.length; i++) {
            expect(resultIndices[i]).toBeGreaterThan(resultIndices[i - 1])
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
