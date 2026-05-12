import { useState } from 'react'
import type { Paper, ReadingStatus } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { Icon } from '../UiIcon'
import { collectTags, filterPapers, getPaperReadingStatus } from './libraryFilters'
import type { FavoriteFilter, LibraryStatusFilter, ReadingStatusFilter } from './libraryTypes'
import { cn } from '@/lib/utils'

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
  { value: 'all', label: '全部状态' },
  { value: 'queued', label: '排队中' },
  { value: 'parsing', label: '解析中' },
  { value: 'parsed', label: '已解析' },
  { value: 'ready', label: '就绪' },
  { value: 'parse_failed', label: '解析失败' },
  { value: 'pending', label: '待确认' },
]

const favoriteOptions: { value: FavoriteFilter; label: string }[] = [
  { value: 'all', label: '全部论文' },
  { value: 'favorites', label: '收藏' },
]

const readingStatusOptions: { value: ReadingStatusFilter; label: string }[] = [
  { value: 'all', label: '全部阅读状态' },
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '阅读中' },
  { value: 'read', label: '已读' },
  { value: 'skipped', label: '已跳过' },
]

const readingStatusLabels: Record<ReadingStatus, string> = {
  unread: '未读',
  reading: '阅读中',
  read: '已读',
  skipped: '已跳过',
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
  const [showAllTags, setShowAllTags] = useState(false)
  const MAX_VISIBLE_TAGS = 8
  const visibleTagsList = showAllTags ? tags : tags.slice(0, MAX_VISIBLE_TAGS)
  const hasMoreTags = tags.length > MAX_VISIBLE_TAGS
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
    <section className="paper-library-list" aria-label="论文列表">
      <div className="paper-library-controls">
        <label className="library-control library-control-search" htmlFor="paper-library-search">
          <span>搜索论文</span>
          <input
            id="paper-library-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索标题、作者或关键词"
            type="search"
            value={searchQuery}
            className="paper-search-input"
          />
        </label>

        <div className="library-filter-row">
          <label className="library-control" htmlFor="paper-library-status">
            <span>状态</span>
            <select
              id="paper-library-status"
              onChange={(event) => onStatusFilterChange(event.target.value as LibraryStatusFilter)}
              value={statusFilter}
              className="model-select"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="library-control" htmlFor="paper-library-favorite">
            <span>收藏</span>
            <select
              id="paper-library-favorite"
              onChange={(event) => onFavoriteFilterChange(event.target.value as FavoriteFilter)}
              value={favoriteFilter}
              className="model-select"
            >
              {favoriteOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="library-control" htmlFor="paper-library-reading">
            <span>阅读</span>
            <select
              id="paper-library-reading"
              onChange={(event) => onReadingStatusFilterChange(event.target.value as ReadingStatusFilter)}
              value={readingStatusFilter}
              className="model-select"
            >
              {readingStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tags.length > 0 && (
        <div className={`tag-filter-bar${showAllTags ? ' expanded' : ''}`} aria-label="标签筛选">
          {activeTag && (
            <button
              aria-label={`清除标签筛选 ${activeTag}`}
              className="tag-filter-pill active"
              onClick={() => onTagChange(null)}
              type="button"
            >
              {activeTag}
              <Icon name="close" />
            </button>
          )}
          {visibleTagsList.map((tag) => (
            <button
              aria-pressed={activeTag === tag}
              className={cn('tag-filter-pill', activeTag === tag && 'active')}
              key={tag}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
          {hasMoreTags && (
            <button
              className="tag-filter-toggle"
              onClick={() => setShowAllTags((v) => !v)}
              type="button"
            >
              {showAllTags ? '收起标签' : `展开更多标签 (+${tags.length - MAX_VISIBLE_TAGS})`}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="paper-list" aria-busy="true">
          <span className="loading-text">加载论文...</span>
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
          <span>没有匹配当前筛选条件的论文。</span>
        </div>
      ) : (
        <div className="paper-list">
          {visiblePapers.map((paper) => {
            const paperTags = paper.tags ?? []
            const visibleTags = paperTags.slice(0, 3)
            const extraCount = paperTags.length - 3
            return (
              <div
                className={cn('paper-library-row', selectedPaperId === paper.id && 'selected')}
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
                  <span className="paper-item-states" aria-label="论文管理状态">
                    {paper.favorite && (
                      <span className="paper-state-pill favorite">
                        <Icon name="spark" />
                        收藏
                      </span>
                    )}
                    <span className={`paper-state-pill reading-state state-${getPaperReadingStatus(paper)}`}>
                      {readingStateLabel(paper)}
                    </span>
                  </span>
                  {paperTags.length > 0 && (
                    <span className="paper-item-tags">
                      {visibleTags.map((tag) => (
                        <span className="paper-tag-pill" key={tag}>
                          {tag}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="paper-tag-pill paper-tag-extra">+{extraCount}</span>
                      )}
                    </span>
                  )}
                </button>
                <button
                  aria-label={`删除 ${paper.title}`}
                  className="paper-delete-btn"
                  onClick={() => void onDelete(paper)}
                  type="button"
                >
                  <Icon name="close" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
