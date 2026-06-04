import { useMemo, useState } from 'react'
import { Star, MoreHorizontal } from 'lucide-react'
import type { Paper } from '../types'
import { Icon } from './UiIcon'
import { updatePaperFavorite } from '../lib/api'

const TAG_VISIBLE_LIMIT = 8

export function PaperList({
  papers,
  selectedPaperId,
  isLoading,
  onSelect,
  onDelete,
  searchQuery,
  onSearchChange,
  allTags,
  activeTag,
  onTagChange,
  isBatchMode = false,
  onBatchDelete,
}: {
  papers: Paper[]
  selectedPaperId: number | null
  isLoading: boolean
  onSelect: (paper: Paper) => void
  onDelete?: (paper: Paper) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  allTags?: string[]
  activeTag?: string | null
  onTagChange?: (tag: string | null) => void
  isBatchMode?: boolean
  onBatchDelete?: (papers: Paper[]) => void
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [togglingFavorite, setTogglingFavorite] = useState<number | null>(null)
  const [moreMenuId, setMoreMenuId] = useState<number | null>(null)
  const [showAllTags, setShowAllTags] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())

  const computedTags = useMemo(() => {
    if (allTags) return allTags
    const tagSet = new Set<string>()
    papers.forEach(p => (p.tags ?? []).forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [papers, allTags])

  const currentActiveTag = activeTag ?? null
  const handleTagChange = onTagChange ?? (() => {})

  const visibleTags = showAllTags ? computedTags : computedTags.slice(0, TAG_VISIBLE_LIMIT)
  const hiddenTagCount = computedTags.length - TAG_VISIBLE_LIMIT

  async function handleToggleFavorite(e: React.MouseEvent, paper: Paper) {
    e.stopPropagation()
    if (togglingFavorite === paper.id) return
    setTogglingFavorite(paper.id)
    try {
      await updatePaperFavorite(paper.id, !paper.favorite)
      paper.favorite = !paper.favorite
    } catch {
      // silently fail
    } finally {
      setTogglingFavorite(null)
    }
  }

  function handleMoreClick(e: React.MouseEvent, paperId: number) {
    e.stopPropagation()
    setMoreMenuId(moreMenuId === paperId ? null : paperId)
  }

  function handleCheckToggle(e: React.MouseEvent, paperId: number) {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(paperId)) next.delete(paperId)
      else next.add(paperId)
      return next
    })
  }

  function handleSelectAll() {
    if (checkedIds.size === papers.length) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(papers.map(p => p.id)))
    }
  }

  function handleBatchDelete() {
    const selected = papers.filter(p => checkedIds.has(p.id))
    if (selected.length === 0) return
    if (!confirm(`确定批量删除 ${selected.length} 篇论文吗？`)) return
    onBatchDelete?.(selected)
    setCheckedIds(new Set())
  }

  return (
    <div>
      <div className="paper-list-header">
        <span className="paper-list-title">论文库</span>
        {!isLoading && papers.length > 0 && (
          <span className="paper-count-badge">{papers.length}</span>
        )}
      </div>

      {/* Batch action toolbar */}
      {isBatchMode && (
        <div className="batch-action-bar">
          <button type="button" className="batch-select-all" onClick={handleSelectAll}>
            {checkedIds.size === papers.length ? '取消全选' : '全选'}
          </button>
          <span className="batch-count">已选 {checkedIds.size} 篇</span>
          <div className="batch-actions">
            <button
              type="button"
              className="btn btn-sm btn-batch-delete"
              disabled={checkedIds.size === 0}
              onClick={handleBatchDelete}
            >批量删除</button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={checkedIds.size === 0}
              onClick={() => {
                const selected = papers.filter(p => checkedIds.has(p.id))
                selected.forEach(p => { updatePaperFavorite(p.id, true) })
                setCheckedIds(new Set())
              }}
            >批量收藏</button>
          </div>
        </div>
      )}

      {papers.length > 0 && (
        <div className="paper-search-box">
          <input
            type="text"
            placeholder="搜索论文..."
            value={searchQuery ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="paper-search-input"
          />
          <span className="search-shortcut-capsule">⌘K</span>
        </div>
      )}

      {computedTags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            type="button"
            className={`tag-filter-pill${!currentActiveTag ? ' active' : ''}`}
            onClick={() => handleTagChange(null)}
          >全部</button>
          {visibleTags.map(tag => (
            <button
              key={tag}
              type="button"
              className={`tag-filter-pill${currentActiveTag === tag ? ' active' : ''}`}
              onClick={() => handleTagChange(currentActiveTag === tag ? null : tag)}
            >{tag}</button>
          ))}
          {hiddenTagCount > 0 && !showAllTags && (
            <button
              type="button"
              className="tag-filter-pill tag-filter-more"
              onClick={() => setShowAllTags(true)}
            >+{hiddenTagCount}</button>
          )}
          {showAllTags && hiddenTagCount > 0 && (
            <button
              type="button"
              className="tag-filter-pill tag-filter-more"
              onClick={() => setShowAllTags(false)}
            >收起</button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="paper-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-item">
              <div className="skeleton skeleton-line" style={{ width: `${70 + i * 5}%` }} />
              <div className="skeleton skeleton-line-short" />
            </div>
          ))}
          <div className="loading-text">正在加载论文...</div>
        </div>
      ) : papers.length === 0 ? (
        <div className="list-empty-state">
          <Icon name="fileText" className="empty-emoji" />
          <div>{searchQuery ? '没有找到匹配的论文' : '还没有论文，请先导入'}</div>
        </div>
      ) : (
        <div className="paper-list">
          {papers.map((paper) => {
            const isSelected = selectedPaperId === paper.id
            return (
              <div
                key={paper.id}
                id={`paper-item-${paper.id}`}
                className={`paper-item-wrapper${isSelected ? ' selected' : ''}`}
                onMouseEnter={() => setHoveredId(paper.id)}
                onMouseLeave={() => { setHoveredId(null); setMoreMenuId(null) }}
              >
                {/* Batch checkbox - top right, only in batch mode */}
                {isBatchMode && (
                  <div
                    className={`paper-item-check${checkedIds.has(paper.id) ? ' checked' : ''}`}
                    onClick={(e) => handleCheckToggle(e, paper.id)}
                    role="checkbox"
                    aria-checked={checkedIds.has(paper.id)}
                    tabIndex={0}
                  >
                    {checkedIds.has(paper.id) && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onSelect(paper)}
                  className="paper-item paper-item--horizontal"
                >
                  {/* PDF Thumbnail - compact */}
                  <div className="paper-item-thumbnail">
                    <div className="paper-thumb-lines">
                      <div className="thumb-line thumb-line--title" />
                      <div className="thumb-line" />
                      <div className="thumb-line" />
                      <div className="thumb-block" />
                      <div className="thumb-line" />
                      <div className="thumb-line thumb-line--short" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="paper-item-content">
                    <div className="paper-item-title">{paper.title}</div>
                    <div className="paper-item-meta">
                      {paper.authors && (
                        <>
                          <span className="paper-authors">{paper.authors}</span>
                          <span className="paper-meta-separator">·</span>
                        </>
                      )}
                      <span className="paper-source">{paper.source}</span>
                      {paper.updated_at && (
                        <>
                          <span className="paper-meta-separator">·</span>
                          <span className="paper-date">{new Date(paper.updated_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                    {(paper.tags ?? []).length > 0 && (
                      <div className="paper-item-tags">
                        {paper.tags!.slice(0, 3).map(tag => (
                          <span key={tag} className="paper-tag-pill">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                {/* Action buttons - always visible, right center */}
                <div className="paper-item-actions always-visible">
                  <button
                    type="button"
                    className={`paper-item-action-btn${paper.favorite ? ' active' : ''}`}
                    title={paper.favorite ? '取消收藏' : '收藏'}
                    onClick={(e) => handleToggleFavorite(e, paper)}
                    disabled={togglingFavorite === paper.id}
                  >
                    <Star size={14} fill={paper.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="paper-item-action-btn"
                    title="更多操作"
                    onClick={(e) => handleMoreClick(e, paper.id)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                {/* More menu dropdown */}
                {moreMenuId === paper.id && (
                  <div className="paper-item-more-menu">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(`/paper/${paper.id}/reader`, '_blank', 'noopener')
                        setMoreMenuId(null)
                      }}
                    >打开阅读器</button>
                    {onDelete && (
                      <button
                        type="button"
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`确定删除论文「${paper.title}」吗？`)) {
                            onDelete(paper)
                          }
                          setMoreMenuId(null)
                        }}
                      >删除论文</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
