import { useState, useRef, useEffect } from 'react'
import { Bookmark, MoreHorizontal, BookOpen, FolderPlus, EyeOff, Trash2, Eye } from 'lucide-react'
import type { MockPaper } from './mockData'
import { truncateText } from './dashboardUtils'
import { PaperThumbnail } from './PaperThumbnail'
import { showToast } from './DashboardToast'
import { updatePaperFavorite, updatePaperReadingState, deletePaper } from '../../lib/api'

export type PaperListItemProps = {
  paper: MockPaper
  onOpenPaper?: (paperId: number) => void
  onPaperUpdated?: (paperId: string, changes: Partial<MockPaper>) => void
  onAddToProject?: (paperTitle: string) => void
}

export function PaperListItem({ paper, onOpenPaper, onPaperUpdated, onAddToProject }: PaperListItemProps) {
  const relevancePercent = Math.round(paper.relevanceScore * 100)
  const displayTitle = truncateText(paper.title, 100)
  const displayAbstract = truncateText(paper.abstract, 140)
  const displayTags = paper.tags.slice(0, 4)

  const [isFavorite, setIsFavorite] = useState(paper.favorite ?? false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Sync with prop when parent data refreshes
  useEffect(() => { setIsFavorite(paper.favorite ?? false) }, [paper.favorite])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const numericId = parseInt(paper.id, 10)
  const hasValidId = !isNaN(numericId)

  async function handleFavorite() {
    if (!hasValidId) { setIsFavorite(!isFavorite); showToast(isFavorite ? '已取消收藏' : '已收藏', 'success'); return }
    try {
      const next = !isFavorite
      await updatePaperFavorite(numericId, next)
      setIsFavorite(next)
      onPaperUpdated?.(paper.id, { favorite: next } as Partial<MockPaper>)
      showToast(next ? '已收藏' : '已取消收藏', 'success')
    } catch { showToast('收藏操作失败', 'error') }
  }

  async function handleMarkRead() {
    setMenuOpen(false)
    if (!hasValidId) { onPaperUpdated?.(paper.id, { isRead: true }); showToast('已标记为已读', 'success'); return }
    try { await updatePaperReadingState(numericId, { reading_status: 'read' }); onPaperUpdated?.(paper.id, { isRead: true }); showToast('已标记为已读', 'success') }
    catch { showToast('标记失败', 'error') }
  }

  function handleMarkUnread() {
    setMenuOpen(false)
    if (hasValidId) { updatePaperReadingState(numericId, { reading_status: 'unread' }).catch(() => {}) }
    onPaperUpdated?.(paper.id, { isRead: false })
    showToast('已标记为未读', 'success')
  }

  function handleAddToProject() { setMenuOpen(false); onAddToProject ? onAddToProject(paper.title) : showToast('加入项目功能开发中', 'info') }
  function handleIgnore() { setMenuOpen(false); if (hasValidId) { updatePaperReadingState(numericId, { reading_status: 'skipped' }).catch(() => {}) }; onPaperUpdated?.(paper.id, { isRead: true }); showToast('已忽略', 'success') }
  async function handleDelete() { setMenuOpen(false); if (!hasValidId) { showToast('无法删除', 'error'); return }; try { await deletePaper(numericId); showToast('已删除', 'success') } catch { showToast('删除失败', 'error') } }

  return (
    <div
      className="flex min-h-[116px] rounded-[18px] border border-[#E2E8F0] bg-white transition-all duration-200 hover:border-[#BFDBFE] hover:shadow-[0_4px_20px_rgba(37,99,235,0.06)]"
    >
      {/* Left: Thumbnail */}
      <div className="flex items-center py-3.5 pl-4">
        <PaperThumbnail
          variant={parseInt(paper.id.replace(/\D/g, ''), 10) || 1}
          paperId={numericId}
          thumbnailUrl={paper.thumbnailUrl}
          title={paper.title}
          abstractText={paper.abstract}
          className="h-[88px] w-[68px]"
        />
      </div>

      {/* Center: Content */}
      <div className="flex flex-1 flex-col justify-center py-3 px-4 min-w-0">
        <h4
          className="text-[14px] font-bold text-[#0F172A] leading-[1.4] line-clamp-2 cursor-pointer hover:text-[#2563EB] transition-colors"
          onClick={() => { if (hasValidId && onOpenPaper) onOpenPaper(numericId) }}
        >
          {displayTitle}
        </h4>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[#64748B]">
          <span>{paper.source}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span>{paper.date}</span>
          {paper.citations > 0 && (<><span className="text-[#CBD5E1]">·</span><span>引用 {paper.citations}</span></>)}
          {paper.project && (<><span className="text-[#CBD5E1]">·</span><span>{paper.project}</span></>)}
          {paper.isRead && <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-[1px] text-[10px] text-emerald-600 font-medium">已读</span>}
        </div>
        {displayAbstract && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#64748B] line-clamp-2">{displayAbstract}</p>
        )}
        {displayTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-[6px]">
            {displayTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-[2px] text-[11px] font-medium text-[#64748B]">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Right: Relevance + actions — fixed 88px */}
      <div className="flex w-[88px] shrink-0 flex-col items-center justify-center gap-1.5 border-l border-[#F1F5F9] px-3">
        {relevancePercent > 0 && (
          <>
            <span className="text-[20px] font-bold text-[#14B8A6]">{relevancePercent}%</span>
            <span className="text-[10px] text-[#94A3B8]">相关度</span>
          </>
        )}
        <div className="flex items-center gap-0.5 mt-1 relative" ref={menuRef}>
          <button
            type="button"
            onClick={handleFavorite}
            className={`rounded-md p-1 transition-colors ${isFavorite ? 'text-[#2563EB] bg-blue-50' : 'text-[#CBD5E1] hover:text-[#2563EB] hover:bg-blue-50'}`}
            aria-label="收藏"
          >
            <Bookmark size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="rounded-md p-1 text-[#CBD5E1] transition-colors hover:text-[#64748B] hover:bg-slate-50"
            aria-label="更多操作"
          >
            <MoreHorizontal size={14} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-[140px] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-xl z-[200]">
              <button onClick={() => { setMenuOpen(false); if (hasValidId && onOpenPaper) onOpenPaper(numericId) }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><BookOpen size={13}/>打开论文</button>
              {paper.isRead ? (
                <button onClick={handleMarkUnread} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><Eye size={13}/>标记未读</button>
              ) : (
                <button onClick={handleMarkRead} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><BookOpen size={13}/>标记已读</button>
              )}
              <button onClick={handleAddToProject} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><FolderPlus size={13}/>加入项目</button>
              <button onClick={handleIgnore} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><EyeOff size={13}/>忽略</button>
              <div className="my-1 border-t border-[#F1F5F9]"/>
              <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-red-50"><Trash2 size={13}/>删除</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
