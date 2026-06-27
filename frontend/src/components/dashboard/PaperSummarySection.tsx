import { useState, useMemo } from 'react'
import { ArrowUpDown, List, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MockPaper } from './mockData'
import { filterPapers, type PaperFilter } from './dashboardUtils'
import { PaperListItem } from './PaperListItem'
import { EmptyState } from './EmptyState'

export type PaperSummarySectionProps = {
  papers: MockPaper[]
  onOpenPaper?: (paperId: number) => void
  searchQuery?: string
  onAddToProject?: (paperTitle: string) => void
  onRefreshData?: () => Promise<void>
}

type SortKey = 'relevance' | 'date' | 'citations' | 'source' | 'status'
type ViewMode = 'list' | 'grid'

const FILTERS: PaperFilter[] = ['全部', '未读', '已读']
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: '按相关度' },
  { key: 'date', label: '按发布时间' },
  { key: 'citations', label: '按引用数' },
  { key: 'source', label: '按来源' },
  { key: 'status', label: '按阅读状态' },
]
const PAGE_SIZES = [8, 10, 20]

function searchPapers(papers: MockPaper[], query: string): MockPaper[] {
  if (!query.trim()) return papers
  const q = query.toLowerCase()
  return papers.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.abstract.toLowerCase().includes(q) ||
    p.source.toLowerCase().includes(q) ||
    p.tags.some(tag => tag.toLowerCase().includes(q))
  )
}

function sortPapers(papers: MockPaper[], sortKey: SortKey): MockPaper[] {
  const sorted = [...papers]
  switch (sortKey) {
    case 'relevance': return sorted.sort((a, b) => b.relevanceScore - a.relevanceScore)
    case 'date': return sorted.sort((a, b) => b.date.localeCompare(a.date))
    case 'citations': return sorted.sort((a, b) => b.citations - a.citations)
    case 'source': return sorted.sort((a, b) => a.source.localeCompare(b.source))
    case 'status': return sorted.sort((a, b) => Number(a.isRead) - Number(b.isRead))
    default: return sorted
  }
}

export function PaperSummarySection({ papers: initialPapers, onOpenPaper, searchQuery = '', onAddToProject, onRefreshData }: PaperSummarySectionProps) {
  const [activeFilter, setActiveFilter] = useState<PaperFilter>('全部')
  const [localPapers, setLocalPapers] = useState<MockPaper[]>(initialPapers)
  const [sortKey, setSortKey] = useState<SortKey>('relevance')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  useMemo(() => { setLocalPapers(initialPapers) }, [initialPapers])

  // Pipeline: search → filter → sort
  const searchedPapers = useMemo(() => searchPapers(localPapers, searchQuery), [localPapers, searchQuery])
  const filteredPapers = useMemo(() => filterPapers(searchedPapers, activeFilter), [searchedPapers, activeFilter])
  const sortedPapers = useMemo(() => sortPapers(filteredPapers, sortKey), [filteredPapers, sortKey])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedPapers.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedPapers = sortedPapers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function getFilterCount(filter: PaperFilter): number {
    return filterPapers(searchedPapers, filter).length
  }

  function handleFilterClick(filter: PaperFilter) {
    setActiveFilter(filter)
    setPage(1)
  }

  function handleSortChange(key: SortKey) {
    setSortKey(key)
    setSortMenuOpen(false)
    setPage(1)
  }

  function handlePaperUpdated(paperId: string, changes: Partial<MockPaper>) {
    setLocalPapers(prev => prev.map(p => p.id === paperId ? { ...p, ...changes } : p))
    // Refresh parent data if favorite changed to keep all views in sync
    if ('favorite' in changes && onRefreshData) {
      onRefreshData()
    }
  }

  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? '按相关度'

  return (
    <section className="mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-[#0F172A]">
          今日论文汇总{searchQuery ? ` · 搜索: "${searchQuery}"` : ''}
        </h2>
        <div className="flex items-center gap-3">
          {/* Sort control */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortMenuOpen(!sortMenuOpen)}
              className="flex items-center gap-1 text-[12px] text-[#64748B] transition-colors duration-200 hover:text-[#334155]"
            >
              <ArrowUpDown size={13} />
              <span>{currentSortLabel}</span>
            </button>
            {sortMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-32 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg z-50">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => handleSortChange(opt.key)}
                    className={`flex w-full items-center px-3 py-1.5 text-[12px] transition-colors ${sortKey === opt.key ? 'text-[#2563EB] bg-blue-50' : 'text-[#334155] hover:bg-[#F8FAFC]'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-md p-1.5 transition-colors duration-200 ${viewMode === 'list' ? 'text-[#2563EB] bg-blue-50' : 'text-[#94A3B8] hover:text-[#64748B] hover:bg-slate-50'}`}
              aria-label="列表视图"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-1.5 transition-colors duration-200 ${viewMode === 'grid' ? 'text-[#2563EB] bg-blue-50' : 'text-[#94A3B8] hover:text-[#64748B] hover:bg-slate-50'}`}
              aria-label="网格视图"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mt-3 flex items-center gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => handleFilterClick(filter)}
            className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-all duration-200 ${
              activeFilter === filter
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] hover:border-[#CBD5E1]'
            }`}
          >
            {filter} {getFilterCount(filter)}
          </button>
        ))}
      </div>

      {/* Paper list / grid */}
      <div className={`dash-paper-list mt-3 ${viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2.5'}`}>
        {localPapers.length === 0 ? (
          <EmptyState title="暂无论文" description="今日还没有候选论文，请先生成日报或添加订阅源" icon="inbox" />
        ) : pagedPapers.length > 0 ? (
          pagedPapers.map((paper) => (
            <PaperListItem key={paper.id} paper={paper} onOpenPaper={onOpenPaper} onPaperUpdated={handlePaperUpdated} onAddToProject={onAddToProject} />
          ))
        ) : (
          <div className="py-12 text-center text-[13px] text-[#94A3B8] col-span-2">当前筛选条件下暂无论文</div>
        )}
      </div>

      {/* Pagination */}
      {sortedPapers.length > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-[#64748B]">
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
              className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-[12px] outline-none"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>条 · 共 {sortedPapers.length} 条</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-[#E2E8F0] p-1.5 text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
              Math.max(0, currentPage - 3),
              Math.min(totalPages, currentPage + 2)
            ).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${p === currentPage ? 'bg-[#2563EB] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-[#E2E8F0] p-1.5 text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
