import type { CategoryScope as BaseCategoryScope, Paper, ReadingStatus } from '../../types'

export type CategoryScope = BaseCategoryScope

export type LibraryStatusFilter =
  | 'all'
  | 'ready'
  | 'imported'
  | 'parsing'
  | 'summarizing'
  | 'parse_failed'
  | 'pending'
  | string

export type FavoriteFilter = 'all' | 'favorites'

export type ReadingStatusFilter = 'all' | ReadingStatus

export type ImportConfirmPayload = {
  source: string
  title: string
  file: File
}

export type PaperFilterInput = {
  papers: Paper[]
  selectedCategoryId: number | null
  searchQuery: string
  statusFilter: LibraryStatusFilter
  activeTag: string | null
  favoriteFilter?: FavoriteFilter
  readingStatusFilter?: ReadingStatusFilter
}
