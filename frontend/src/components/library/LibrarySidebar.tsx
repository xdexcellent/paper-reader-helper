import type { Category, Paper } from '../../types'
import { filterCategoriesByScope } from './libraryFilters'
import type { CategoryScope } from './libraryTypes'

type LibrarySidebarProps = {
  papers: Paper[]
  categories: Category[]
  selectedCategoryId: number | null
  categoryScope: CategoryScope
  onCategoryScopeChange: (scope: CategoryScope) => void
  onSelectCategory: (categoryId: number | null) => void
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
}: LibrarySidebarProps) {
  const visibleCategories = filterCategoriesByScope(categories, categoryScope)

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
