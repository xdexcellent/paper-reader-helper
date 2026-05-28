import { useState, useRef, useEffect } from 'react'
import { BookOpen, Bookmark, MoreHorizontal, CheckCircle, FolderPlus, EyeOff, Search, Trash2 } from 'lucide-react'
import { truncateText } from './dashboardUtils'
import { PaperThumbnail } from './PaperThumbnail'
import { showToast } from './DashboardToast'
import { updatePaperFavorite } from '../../lib/api'

export type PriorityPaperCardProps = {
  rank: number
  paperId?: string
  title: string
  source: string
  date: string
  citations: number
  tags: string[]
  relevanceScore: number
  thumbnailUrl: string
  favorite?: boolean
  onRead: () => void
  onAddToProject?: (title: string) => void
  onDismiss?: (rank: number) => void
  onFavoriteChange?: () => void
}

const rankGradients: Record<number, string> = {
  1: 'from-[#7C3AED] to-[#2563EB]',
  2: 'from-[#0EA5E9] to-[#2563EB]',
  3: 'from-[#14B8A6] to-[#06B6D4]',
}

export function PriorityPaperCard({
  rank,
  paperId,
  title,
  source,
  date,
  citations,
  tags,
  relevanceScore,
  thumbnailUrl,
  favorite = false,
  onRead,
  onAddToProject,
  onDismiss,
  onFavoriteChange,
}: PriorityPaperCardProps) {
  const gradient = rankGradients[rank] ?? rankGradients[1]
  const displayTags = tags.slice(0, 3)
  const relevancePercent = Math.round(relevanceScore * 100)
  const [isFavorite, setIsFavorite] = useState(favorite)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Sync with prop when parent data refreshes
  useEffect(() => { setIsFavorite(favorite) }, [favorite])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleFavorite(e?: React.MouseEvent) {
    e?.stopPropagation()
    const next = !isFavorite
    setIsFavorite(next)
    const numericId = paperId ? parseInt(paperId, 10) : NaN
    if (!isNaN(numericId)) {
      try {
        await updatePaperFavorite(numericId, next)
      } catch {
        setIsFavorite(!next) // revert on failure
        showToast('收藏操作失败', 'error')
        return
      }
    }
    showToast(next ? '已收藏' : '已取消收藏', 'success')
    onFavoriteChange?.()
  }

  function handleMarkRead() { setMenuOpen(false); showToast('已标记为已读', 'success') }
  function handleAddToProject() { setMenuOpen(false); onAddToProject ? onAddToProject(title) : showToast('加入项目功能开发中', 'info') }
  function handleDismiss() { setMenuOpen(false); onDismiss?.(rank); showToast('已忽略该推荐', 'success') }
  function handleSimilar() { setMenuOpen(false); showToast('查看相似论文功能开发中', 'info') }

  return (
    <div
      className="flex min-h-[96px] rounded-[18px] border border-[#E2E8F0] bg-white transition-all duration-200 hover:border-[#BFDBFE] hover:shadow-[0_8px_32px_rgba(37,99,235,0.07)]"
      style={{ boxShadow: '0 6px 24px rgba(15,23,42,0.04)' }}
    >
      {/* Left: Gradient rank bar */}
      <div className={`flex w-[48px] shrink-0 items-center justify-center rounded-l-[18px] bg-gradient-to-b ${gradient}`}>
        <span className="text-[18px] font-bold text-white">{rank}</span>
      </div>

      {/* Thumbnail */}
      <div className="flex items-center px-3.5 py-3">
        <PaperThumbnail variant={rank} className="h-[72px] w-[112px]" />
      </div>

      {/* Center: Paper info */}
      <div className="flex flex-1 flex-col justify-center py-3 pr-4 min-w-0">
        <h3 className="text-[14px] font-bold leading-[1.4] text-[#0F172A] line-clamp-2">
          {truncateText(title, 90)}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#64748B]">
          <span>{source}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span>{date}</span>
          {citations > 0 && (<><span className="text-[#CBD5E1]">·</span><span>引用 {citations}</span></>)}
        </div>
        {displayTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-[6px]">
            {displayTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#EFF6FF] px-2.5 py-[2px] text-[11px] font-medium text-[#3B82F6]">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Right: Relevance + actions */}
      <div className="flex w-[240px] shrink-0 items-center justify-end gap-2 border-l border-[#F1F5F9] pl-4 pr-4 relative">
        {/* Relevance */}
        <div className="flex flex-col items-center shrink-0">
          {relevancePercent >= 90 ? (
            <span className="rounded-full bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-[1px] text-[10px] font-semibold text-[#059669]">高度相关</span>
          ) : relevancePercent >= 70 ? (
            <span className="rounded-full bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-[1px] text-[10px] font-semibold text-[#2563EB]">中等相关</span>
          ) : (
            <span className="rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-[1px] text-[10px] font-semibold text-[#64748B]">一般相关</span>
          )}
          <span className="mt-0.5 text-[13px] font-bold text-[#0F172A]">{relevancePercent > 0 ? `${relevancePercent}%` : ''}</span>
        </div>

        {/* Actions */}
        <button
          onClick={onRead}
          className="flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-[5px] text-[11px] font-medium text-white whitespace-nowrap transition-colors hover:bg-[#1d4ed8]"
        >
          <BookOpen size={11} />阅读
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleFavorite(e) }}
          className={`rounded-lg p-[5px] transition-colors ${isFavorite ? 'text-[#2563EB] bg-blue-50' : 'text-[#94A3B8] hover:text-[#2563EB] hover:bg-blue-50'}`}
          aria-label="收藏"
        >
          <Bookmark size={13} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        {/* More button + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="rounded-lg p-[5px] text-[#94A3B8] transition-colors hover:text-[#64748B] hover:bg-slate-50"
            aria-label="更多"
          >
            <MoreHorizontal size={13} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-[148px] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-xl z-[200]">
              <button onClick={handleMarkRead} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><CheckCircle size={13}/>标记已读</button>
              <button onClick={handleAddToProject} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><FolderPlus size={13}/>加入项目</button>
              <button onClick={handleDismiss} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><EyeOff size={13}/>忽略推荐</button>
              <button onClick={handleSimilar} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]"><Search size={13}/>查看相似论文</button>
              <div className="my-1 border-t border-[#F1F5F9]"/>
              <button onClick={handleDismiss} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-red-50"><Trash2 size={13}/>移出今日重点</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
