import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { autoClassifyPendingPapers } from '../../lib/api'
import type { Category, Paper } from '../../types'
import { filterCategoriesByScope } from './libraryFilters'
import type { CategoryScope } from './libraryTypes'
import { Button } from '@/components/ui/button'

type LibrarySidebarProps = {
  papers: Paper[]
  categories: Category[]
  selectedCategoryId: number | null
  categoryScope: CategoryScope
  onCategoryScopeChange: (scope: CategoryScope) => void
  onSelectCategory: (categoryId: number | null) => void
  onRefreshCategories?: () => void
}

const categoryScopeOptions: { value: CategoryScope; label: string }[] = [
  { value: 'all', label: '全部分类' },
  { value: 'system', label: '系统分类' },
  { value: 'custom', label: '自定义' },
  { value: 'pending', label: '待确认' },
]

export function LibrarySidebar({
  papers,
  categories,
  selectedCategoryId,
  categoryScope,
  onCategoryScopeChange,
  onSelectCategory,
  onRefreshCategories,
}: LibrarySidebarProps) {
  const visibleCategories = filterCategoriesByScope(categories, categoryScope)
  const [isClassifying, setIsClassifying] = useState(false)
  const [classifyMessage, setClassifyMessage] = useState('')

  const pendingCount = categories.find(c => c.is_pending_bucket)?.paper_count ?? 0

  async function handleAutoClassify() {
    setIsClassifying(true)
    setClassifyMessage('')
    try {
      const result = await autoClassifyPendingPapers()
      const parts: string[] = []
      if (result.classified > 0) parts.push(`已分类 ${result.classified} 篇`)
      if (result.created_categories.length > 0) parts.push(`新建分类: ${result.created_categories.join(', ')}`)
      if (result.deleted_categories.length > 0) parts.push(`清理空分类: ${result.deleted_categories.join(', ')}`)
      setClassifyMessage(parts.length > 0 ? parts.join('；') : '没有需要分类的论文')
      onRefreshCategories?.()
    } catch (e) {
      setClassifyMessage('分类失败，请检查 API Key 配置')
    } finally {
      setIsClassifying(false)
    }
  }

  return (
    <aside className="library-sidebar" aria-label="论文分类">
      <div className="library-sidebar-header">
        <div>
          <p className="panel-chip">论文管理</p>
          <h2>分类</h2>
        </div>
        <strong>{papers.length}</strong>
      </div>

      <label className="library-control" htmlFor="library-category-scope">
        <span>分类范围</span>
        <select
          id="library-category-scope"
          onChange={(event) => onCategoryScopeChange(event.target.value as CategoryScope)}
          value={categoryScope}
        >
          {categoryScopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {pendingCount > 0 && (
        <div className="library-control">
          <Button
            variant="default"
            size="sm"
            className="w-full justify-center shadow-sm"
            disabled={isClassifying}
            onClick={() => void handleAutoClassify()}
            type="button"
            title="使用 AI 自动为待确认论文分配分类"
          >
            {isClassifying ? <><span className="spinner" />分类中...</> : <><Sparkles size={14} /> AI 智能分类 ({pendingCount})</>}
          </Button>
          {classifyMessage && <small style={{ marginTop: '4px', display: 'block', opacity: 0.8 }}>{classifyMessage}</small>}
        </div>
      )}

      <div className="library-category-list">
        <button
          aria-label={`全部论文 ${papers.length}`}
          aria-pressed={selectedCategoryId === null}
          className={`library-category-item${selectedCategoryId === null ? ' active' : ''}`}
          onClick={() => onSelectCategory(null)}
          type="button"
        >
          <span>全部论文</span>
          <strong>{papers.length}</strong>
        </button>

        {visibleCategories.map((category) => {
          const pendingLabel = category.pending_count > 0 ? ` ${category.pending_count} 篇待确认` : ''
          return (
            <button
              aria-label={`${category.name} ${category.paper_count} 篇论文${pendingLabel}`}
              aria-pressed={selectedCategoryId === category.id}
              className={`library-category-item${selectedCategoryId === category.id ? ' active' : ''}`}
              key={category.id}
              onClick={() => onSelectCategory(category.id)}
              type="button"
            >
              <span>{category.name}</span>
              {category.pending_count > 0 && (
                <small>{category.pending_count} 篇待确认</small>
              )}
              <strong>{category.paper_count}</strong>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
