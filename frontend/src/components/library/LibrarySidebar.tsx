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
  { value: 'all', label: 'All categories' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
  { value: 'pending', label: 'Pending' },
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
    <aside className="library-sidebar" aria-label="Library categories">
      <div className="library-sidebar-header">
        <div>
          <p className="panel-chip">Library</p>
          <h2>Categories</h2>
        </div>
        <strong>{papers.length}</strong>
      </div>

      <label className="library-control" htmlFor="library-category-scope">
        <span>Category scope</span>
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
          aria-label={`All papers ${papers.length}`}
          aria-pressed={selectedCategoryId === null}
          className={`library-category-item${selectedCategoryId === null ? ' active' : ''}`}
          onClick={() => onSelectCategory(null)}
          type="button"
        >
          <span>All papers</span>
          <strong>{papers.length}</strong>
        </button>

        {visibleCategories.map((category) => (
          <button
            aria-label={`${category.name} ${category.paper_count} papers ${category.pending_count} pending`}
            aria-pressed={selectedCategoryId === category.id}
            className={`library-category-item${selectedCategoryId === category.id ? ' active' : ''}`}
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            type="button"
          >
            <span>{category.name}</span>
            <small>{category.pending_count} pending</small>
            <strong>{category.paper_count}</strong>
          </button>
        ))}
      </div>
    </aside>
  )
}
