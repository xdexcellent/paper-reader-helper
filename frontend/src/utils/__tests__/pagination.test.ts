import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { paginateArray, computeTotalPages } from '../pagination'

/**
 * Property 1: Pagination preserves all items and respects page boundaries
 * **Validates: Requirements 3.1**
 */
describe('Property 1: Pagination preserves all items and respects page boundaries', () => {
  it('computeTotalPages equals Math.ceil(length / pageSize) or 1 when empty', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (totalItems, pageSize) => {
          const result = computeTotalPages(totalItems, pageSize)
          const expected = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize)
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('each page has at most pageSize items', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, pageSize) => {
          const totalPages = computeTotalPages(items.length, pageSize)
          for (let page = 1; page <= totalPages; page++) {
            const pageItems = paginateArray(items, page, pageSize)
            expect(pageItems.length).toBeLessThanOrEqual(pageSize)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('concatenation of all pages equals original array (no loss/duplication)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, pageSize) => {
          const totalPages = computeTotalPages(items.length, pageSize)
          const allPageItems: number[] = []
          for (let page = 1; page <= totalPages; page++) {
            allPageItems.push(...paginateArray(items, page, pageSize))
          }
          expect(allPageItems).toEqual(items)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('last page has correct remainder count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, pageSize) => {
          const totalPages = computeTotalPages(items.length, pageSize)
          const lastPage = paginateArray(items, totalPages, pageSize)
          const remainder = items.length % pageSize
          const expectedLastPageSize = remainder === 0 ? pageSize : remainder
          expect(lastPage.length).toBe(expectedLastPageSize)
        }
      ),
      { numRuns: 100 }
    )
  })
})
