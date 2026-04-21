import { useMemo, useState } from 'react'
import type { Paper } from '../types'
import { StatusBadge } from './StatusBadge'
import { Icon } from './UiIcon'

export function PaperList({
  papers,
  selectedPaperId,
  isLoading,
  onSelect,
  onDelete,
  searchQuery,
  onSearchChange,
}: {
  papers: Paper[]
  selectedPaperId: number | null
  isLoading: boolean
  onSelect: (paper: Paper) => void
  onDelete?: (paper: Paper) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Collect all unique tags from papers
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    papers.forEach(p => (p.tags ?? []).forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [papers])

  const filteredPapers = papers.filter(p => {
    const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchTag = !activeTag || (p.tags ?? []).includes(activeTag)
    return matchSearch && matchTag
  })

  return (
    <div>
      <div className="paper-list-header">
        <span className="paper-list-title">论文库</span>
        {!isLoading && papers.length > 0 && (
          <span className="paper-count-badge">{papers.length}</span>
        )}
      </div>

      {papers.length > 0 && (
        <div className="paper-search-box">
          <input
            type="text"
            placeholder="搜索论文..."
            value={searchQuery ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="paper-search-input"
          />
        </div>
      )}

      {allTags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            type="button"
            className={`tag-filter-pill${!activeTag ? ' active' : ''}`}
            onClick={() => setActiveTag(null)}
          >全部</button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              className={`tag-filter-pill${activeTag === tag ? ' active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >{tag}</button>
          ))}
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
      ) : filteredPapers.length === 0 ? (
        <div className="list-empty-state">
          <Icon name="fileText" className="empty-emoji" />
          <div>{searchQuery ? '没有找到匹配的论文' : '还没有论文，请先导入'}</div>
        </div>
      ) : (
        <div className="paper-list">
          {filteredPapers.map((paper) => {
            const isSelected = selectedPaperId === paper.id
            const isHovered = hoveredId === paper.id
            return (
              <div
                key={paper.id}
                id={`paper-item-${paper.id}`}
                className={`paper-item-wrapper${isSelected ? ' selected' : ''}`}
                onMouseEnter={() => setHoveredId(paper.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  type="button"
                  onClick={() => onSelect(paper)}
                  className="paper-item"
                >
                  <div className="paper-item-title">{paper.title}</div>
                  <div className="paper-item-meta">
                    <span className="paper-source">{paper.source}</span>
                    <StatusBadge value={paper.status} />
                  </div>
                  {(paper.tags ?? []).length > 0 && (
                    <div className="paper-item-tags">
                      {paper.tags!.map(tag => (
                        <span key={tag} className="paper-tag-pill">{tag}</span>
                      ))}
                    </div>
                  )}
                </button>
                {onDelete && isHovered && (
                  <button
                    type="button"
                    className="paper-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`确定删除论文「${paper.title}」吗？`)) {
                        onDelete(paper)
                      }
                    }}
                    title="删除论文"
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
