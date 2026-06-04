/**
 * Pagination utility functions for client-side array pagination.
 */

/**
 * Returns a slice of the given array corresponding to the specified page.
 *
 * @param items - The full array to paginate
 * @param page - The 1-based page number
 * @param pageSize - Number of items per page
 * @returns The subset of items for the requested page
 */
export function paginateArray<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/**
 * Computes the total number of pages needed to display all items.
 * Returns at least 1 even when totalItems is 0.
 *
 * @param totalItems - Total number of items
 * @param pageSize - Number of items per page
 * @returns The total page count (minimum 1)
 */
export function computeTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}
