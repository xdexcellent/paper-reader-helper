import type { Paper, ReadingStatus } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import { collectTags, filterPapers, getPaperReadingStatus } from './libraryFilters'
import type { FavoriteFilter, LibraryStatusFilter, ReadingStatusFilter } from './libraryTypes'

type PaperLibraryListProps = {
  papers: Paper[]
  selectedPaperId: number | null
  isLoading: boolean
  searchQuery: string
  statusFilter: LibraryStatusFilter
  favoriteFilter: FavoriteFilter
  readingStatusFilter: ReadingStatusFilter
  activeTag: string | null
  onSearchChange: (query: string) => void
  onStatusFilterChange: (status: LibraryStatusFilter) => void
  onFavoriteFilterChange: (filter: FavoriteFilter) => void
  onReadingStatusFilterChange: (filter: ReadingStatusFilter) => void
  onTagChange: (tag: string | null) => void
  onSelect: (paper: Paper) => void
  onDelete: (paper: Paper) => void | Promise<void>
}

const statusOptions: { value: LibraryStatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'ready', label: 'Ready' },
  { value: 'imported', label: 'Imported' },
  { value: 'parsing', label: 'Parsing' },
  { value: 'summarizing', label: 'Summarizing' },
  { value: 'parse_failed', label: 'Parse failed' },
  { value: 'pending', label: 'Pending' },
]

const favoriteOptions: { value: FavoriteFilter; label: string }[] = [
  { value: 'all', label: 'All papers' },
  { value: 'favorites', label: 'Favorites' },
]

const readingStatusOptions: { value: ReadingStatusFilter; label: string }[] = [
  { value: 'all', label: 'All reading' },
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'read', label: 'Read' },
  { value: 'skipped', label: 'Skipped' },
]

const readingStatusLabels: Record<ReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  read: 'Read',
  skipped: 'Skipped',
}

function paperButtonLabel(paper: Paper): string {
  return [
    paper.title,
    paper.source,
    paper.status,
    ...(paper.tags ?? []),
  ].join(' ')
}

function readingStateLabel(paper: Paper): string {
  const status = getPaperReadingStatus(paper)
  const progress = paper.reading_progress ?? 0
  const label = readingStatusLabels[status]
  if ((status === 'reading' || status === 'read') && progress > 0) {
    return `${label} ${progress}%`
  }
  return label
}

export function PaperLibraryList({
  papers,
  selectedPaperId,
  isLoading,
  searchQuery,
  statusFilter,
  favoriteFilter,
  readingStatusFilter,
  activeTag,
  onSearchChange,
  onStatusFilterChange,
  onFavoriteFilterChange,
  onReadingStatusFilterChange,
  onTagChange,
  onSelect,
  onDelete,
}: PaperLibraryListProps) {
  const tags = collectTags(papers)
  const visiblePapers = filterPapers({
    papers,
    selectedCategoryId: null,
    searchQuery,
    statusFilter,
    favoriteFilter,
    readingStatusFilter,
    activeTag,
  })

  return (
    <section className="paper-library-list" aria-label="Papers">
      <div className="paper-library-controls">
        <label className="library-control" htmlFor="paper-library-search">
          <span>Search papers</span>
          <input
            id="paper-library-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title or source"
            type="search"
            value={searchQuery}
          />
        </label>

        <label className="library-control" htmlFor="paper-library-status">
          <span>Status filter</span>
          <select
            id="paper-library-status"
            onChange={(event) => onStatusFilterChange(event.target.value as LibraryStatusFilter)}
            value={statusFilter}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="library-control" htmlFor="paper-library-favorite">
          <span>Favorite filter</span>
          <select
            id="paper-library-favorite"
            onChange={(event) => onFavoriteFilterChange(event.target.value as FavoriteFilter)}
            value={favoriteFilter}
          >
            {favoriteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="library-control" htmlFor="paper-library-reading">
          <span>Reading filter</span>
          <select
            id="paper-library-reading"
            onChange={(event) => onReadingStatusFilterChange(event.target.value as ReadingStatusFilter)}
            value={readingStatusFilter}
          >
            {readingStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tags.length > 0 && (
        <div className="tag-filter-bar" aria-label="Tag filters">
          {activeTag && (
            <button
              aria-label={`Clear tag filter ${activeTag}`}
              className="tag-filter-pill active"
              onClick={() => onTagChange(null)}
              type="button"
            >
              {activeTag}
              <Icon name="close" />
            </button>
          )}
          {tags.map((tag) => (
            <button
              aria-pressed={activeTag === tag}
              className={`tag-filter-pill${activeTag === tag ? ' active' : ''}`}
              key={tag}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="paper-list" aria-busy="true">
          <span className="loading-text">Loading papers...</span>
          {[1, 2, 3].map((index) => (
            <div className="skeleton-item" key={index}>
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line-short" />
            </div>
          ))}
        </div>
      ) : visiblePapers.length === 0 ? (
        <div className="list-empty-state">
          <Icon name="fileText" />
          <span>No papers match the current filters.</span>
        </div>
      ) : (
        <div className="paper-list">
          {visiblePapers.map((paper) => (
            <div
              className={`paper-library-row${selectedPaperId === paper.id ? ' selected' : ''}`}
              key={paper.id}
            >
              <button
                aria-label={paperButtonLabel(paper)}
                aria-pressed={selectedPaperId === paper.id}
                className="paper-library-item"
                onClick={() => onSelect(paper)}
                type="button"
              >
                <span className="paper-item-title">{paper.title}</span>
                <span className="paper-item-meta">
                  <span className="paper-source">{paper.source}</span>
                  <StatusBadge value={paper.status} />
                </span>
                <span className="paper-item-states" aria-label="Paper organization state">
                  {paper.favorite && (
                    <span className="paper-state-pill favorite">
                      <Icon name="spark" />
                      Favorite
                    </span>
                  )}
                  <span className={`paper-state-pill reading-state state-${getPaperReadingStatus(paper)}`}>
                    {readingStateLabel(paper)}
                  </span>
                </span>
                {(paper.tags ?? []).length > 0 && (
                  <span className="paper-item-tags">
                    {paper.tags!.map((tag) => (
                      <span className="paper-tag-pill" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              <button
                aria-label={`Delete ${paper.title}`}
                className="paper-delete-btn"
                onClick={() => void onDelete(paper)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
