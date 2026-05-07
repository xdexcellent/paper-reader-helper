import type { Category, Paper } from '../../types'
import type { CategoryScope, PaperFilterInput } from './libraryTypes'

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeTitle(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, ' ')
}

export function filterCategoriesByScope(categories: Category[], scope: CategoryScope): Category[] {
  if (scope === 'system') return categories.filter((category) => category.is_system)
  if (scope === 'custom') return categories.filter((category) => !category.is_system)
  if (scope === 'pending') return categories.filter((category) => category.is_pending_bucket)
  return categories
}

export function collectTags(papers: Paper[]): string[] {
  const tags = new Set<string>()

  papers.forEach((paper) => {
    ;(paper.tags ?? []).forEach((tag) => {
      const trimmedTag = tag.trim()
      if (trimmedTag) {
        tags.add(trimmedTag)
      }
    })
  })

  return Array.from(tags).sort((left, right) => left.localeCompare(right))
}

export function getPaperReadingStatus(paper: Paper): NonNullable<Paper['reading_status']> {
  return paper.reading_status ?? 'unread'
}

export function filterPapers({
  papers,
  selectedCategoryId,
  searchQuery,
  statusFilter,
  activeTag,
  favoriteFilter = 'all',
  readingStatusFilter = 'all',
}: PaperFilterInput): Paper[] {
  const normalizedQuery = normalizeSearchText(searchQuery)
  const normalizedStatus = normalizeSearchText(statusFilter)

  return papers.filter((paper) => {
    const matchesCategory = selectedCategoryId === null || paper.primary_category_id === selectedCategoryId
    const matchesSearch =
      normalizedQuery === ''
      || paper.title.toLowerCase().includes(normalizedQuery)
      || paper.source.toLowerCase().includes(normalizedQuery)
    const matchesStatus =
      normalizedStatus === ''
      || normalizedStatus === 'all'
      || [
        paper.status,
        paper.parse_status,
        paper.summary_status,
        paper.embedding_status,
        paper.category_status ?? '',
      ].some((status) => normalizeSearchText(status) === normalizedStatus)
    const matchesTag = activeTag === null || (paper.tags ?? []).includes(activeTag)
    const matchesFavorite = favoriteFilter === 'all' || paper.favorite === true
    const matchesReadingStatus =
      readingStatusFilter === 'all'
      || getPaperReadingStatus(paper) === readingStatusFilter

    return (
      matchesCategory
      && matchesSearch
      && matchesStatus
      && matchesTag
      && matchesFavorite
      && matchesReadingStatus
    )
  })
}

export function countPendingPapers(papers: Paper[]): number {
  return papers.filter((paper) => paper.category_status === 'pending_review').length
}

export function countParseFailedPapers(papers: Paper[]): number {
  return papers.filter((paper) => paper.status === 'parse_failed' || paper.parse_status === 'failed').length
}

export function findDuplicateByTitle(papers: Paper[], title: string): Paper | null {
  const normalizedTitle = normalizeTitle(title)
  if (!normalizedTitle) return null

  return papers.find((paper) => normalizeTitle(paper.title) === normalizedTitle) ?? null
}
