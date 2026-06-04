import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { dedupeCategories, CategoryGroup } from '../PaperManagementPage'
import { Category } from '../../types'

/**
 * Feature: paper-management-ui-polish-v3
 * Property 1: Category deduplication preserves total paper count and groups correctly
 *
 * **Validates: Requirements 1.1, 1.4**
 *
 * For any array of Category objects, calling `dedupeCategories` SHALL produce an output where:
 * (a) every output group's `paperCount` equals the sum of `paper_count` values from all
 *     input categories sharing that group's name,
 * (b) every output group's `categoryIds` contains exactly the IDs of input categories
 *     sharing that name,
 * (c) the total paper count across all output groups equals the total paper count across
 *     all input categories, and
 * (d) the original input array is not mutated.
 */

/** Helper: normalize name the same way dedupeCategories does */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC')
}

/** Arbitrary for a non-blank name (at least one non-whitespace character) */
const nonBlankNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)

/** Arbitrary for a valid Category object */
const categoryArb: fc.Arbitrary<Category> = fc.record({
  id: fc.integer({ min: 1, max: 100_000 }),
  name: nonBlankNameArb,
  slug: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ minLength: 0, maxLength: 50 }),
  parent_id: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1000 })),
  is_system: fc.boolean(),
  is_active: fc.boolean(),
  is_pending_bucket: fc.boolean(),
  sort_order: fc.integer({ min: 0, max: 100 }),
  paper_count: fc.integer({ min: 0, max: 10_000 }),
  pending_count: fc.integer({ min: 0, max: 10_000 }),
})

/**
 * Arbitrary that generates categories with controlled name duplication.
 * Uses a small pool of names to ensure grouping actually occurs.
 */
const categoriesWithDupesArb: fc.Arbitrary<Category[]> = fc
  .tuple(
    fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
    fc.array(categoryArb, { minLength: 1, maxLength: 30 }),
  )
  .map(([namePool, cats]) =>
    cats.map((cat) => ({
      ...cat,
      name: namePool[cat.id % namePool.length],
    })),
  )

describe('Feature: paper-management-ui-polish-v3, Property 1: Category deduplication preserves total paper count and groups correctly', () => {
  it('(a) each group paperCount equals sum of paper_count for categories sharing that name', () => {
    fc.assert(
      fc.property(categoriesWithDupesArb, (categories) => {
        const result = dedupeCategories(categories)

        for (const group of result) {
          const matching = categories.filter((c) => normalizeName(c.name) === group.name)
          const expectedCount = matching.reduce((sum, c) => sum + c.paper_count, 0)
          expect(group.paperCount).toBe(expectedCount)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('(b) each group categoryIds contains exactly the IDs of categories sharing that name', () => {
    fc.assert(
      fc.property(categoriesWithDupesArb, (categories) => {
        const result = dedupeCategories(categories)

        for (const group of result) {
          const matching = categories.filter((c) => normalizeName(c.name) === group.name)
          const expectedIds = matching.map((c) => c.id)
          expect(group.categoryIds).toEqual(expectedIds)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('(c) total paper count across all groups equals total paper count across all input categories', () => {
    fc.assert(
      fc.property(
        fc.array(categoryArb, { minLength: 0, maxLength: 50 }),
        (categories) => {
          const result = dedupeCategories(categories)

          const inputTotal = categories.reduce((sum, c) => sum + c.paper_count, 0)
          const outputTotal = result.reduce((sum, g) => sum + g.paperCount, 0)
          expect(outputTotal).toBe(inputTotal)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('(d) the original input array is not mutated', () => {
    fc.assert(
      fc.property(
        fc.array(categoryArb, { minLength: 1, maxLength: 30 }),
        (categories) => {
          // Deep clone to compare after
          const snapshot = JSON.parse(JSON.stringify(categories))

          dedupeCategories(categories)

          expect(categories).toEqual(snapshot)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('empty input produces empty output', () => {
    const result = dedupeCategories([])
    expect(result).toEqual([])
  })

  it('categories with whitespace-only name differences are grouped together', () => {
    fc.assert(
      fc.property(
        categoryArb,
        categoryArb,
        fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
        (cat1, cat2, baseName) => {
          const c1: Category = { ...cat1, name: baseName }
          const c2: Category = { ...cat2, name: `  ${baseName}  ` }

          const result = dedupeCategories([c1, c2])

          // Should produce a single group since trimmed names match
          expect(result.length).toBe(1)
          expect(result[0].paperCount).toBe(c1.paper_count + c2.paper_count)
          expect(result[0].categoryIds).toContain(c1.id)
          expect(result[0].categoryIds).toContain(c2.id)
        },
      ),
      { numRuns: 100 },
    )
  })
})
