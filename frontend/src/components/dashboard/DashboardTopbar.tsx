import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  FileText,
  FileWarning,
  Rss,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react'
import { showToast } from './DashboardToast'

export type DashboardNotification = {
  id: string
  title: string
  desc: string
  time: string
  read?: boolean
  icon: 'report' | 'paper' | 'risk' | 'error'
}

export type DashboardTopbarProps = {
  searchPlaceholder: string
  unreadCount: number
  workspace: { label: string; timezone: string }
  onGenerateReport: () => void
  onSearch: (query: string) => void
  notifications?: DashboardNotification[]
  loading?: boolean
  onViewReport?: () => void
  onOpenSettings?: () => void
}

function loadNotificationReadIds(): Set<string> {
  try {
    const saved = localStorage.getItem('dashboard_notifications_read')
    return saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>()
  } catch {
    return new Set<string>()
  }
}

function saveReadState(notifications: DashboardNotification[]) {
  const readIds = notifications.filter(n => n.read).map(n => n.id)
  localStorage.setItem('dashboard_notifications_read', JSON.stringify(readIds))
}

export function DashboardTopbar({
  searchPlaceholder,
  workspace,
  onGenerateReport,
  onSearch,
  notifications: notificationItems = [],
  loading = false,
  onViewReport,
  onOpenSettings,
}: DashboardTopbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [readIds, setReadIds] = useState(loadNotificationReadIds)
  const notifRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<HTMLDivElement>(null)

  const notifications = useMemo(
    () => notificationItems.map(n => ({ ...n, read: Boolean(n.read || readIds.has(n.id)) })),
    [notificationItems, readIds],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setSearchQuery(value)
    onSearch(value)
  }

  function markAllRead() {
    const updated = notifications.map(n => ({ ...n, read: true }))
    setReadIds(new Set(updated.map(n => n.id)))
    saveReadState(updated)
    showToast('已全部标为已读', 'success')
  }

  const unreadNotifCount = notifications.filter(n => !n.read).length
  const displayBadgeCount = unreadNotifCount > 99 ? '99+' : String(unreadNotifCount)
  const showBadge = unreadNotifCount > 0

  return (
    <header className="flex h-[72px] w-full items-center justify-between border-b border-[#F1F5F9] bg-[#FFFFFF] px-6" role="banner">
      <div className="relative flex-1 max-w-[480px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#94A3B8]" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={searchPlaceholder}
          maxLength={200}
          style={{ background: '#FFFFFF', color: '#334155', borderColor: '#E2E8F0' }}
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] pl-10 pr-16 text-[13px] text-[#334155] placeholder:text-[#94A3B8] outline-none transition-all duration-200 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.06)]"
          aria-label={searchPlaceholder}
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 text-xs text-[#94A3B8] font-medium">Ctrl K</kbd>
      </div>

      <div className="flex items-center gap-3 ml-6">
        <div className="relative" ref={wsRef}>
          <button
            type="button"
            onClick={() => setWsOpen(!wsOpen)}
            className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm text-[#334155] transition-colors duration-200 hover:bg-[#F1F5F9]"
          >
            <span className="h-2 w-2 rounded-full bg-[#10B981]" />
            <span className="font-medium">{workspace.label}</span>
            <span className="text-[#94A3B8] text-xs">{workspace.timezone}</span>
            <ChevronDown className="size-3.5 text-[#94A3B8]" />
          </button>
          {wsOpen && (
            <div className="absolute top-full right-0 mt-1 w-52 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg z-50">
              <div className="px-3 py-2 text-[11px] text-[#94A3B8] border-b border-[#F1F5F9]">工作区状态</div>
              <div className="px-3 py-2 text-[12px] text-[#334155] flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />在线运行中
              </div>
              <div className="px-3 py-1.5 text-[12px] text-[#64748B]">时区: {workspace.timezone}</div>
              <div className="border-t border-[#F1F5F9] mt-1 pt-1">
                <button onClick={() => { setWsOpen(false); onOpenSettings?.() }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
                  <Settings size={13} />自动化设置
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative flex items-center justify-center rounded-[12px] p-2 text-[#334155] transition-colors duration-200 hover:bg-[#F1F5F9]"
            aria-label="通知"
          >
            <Bell className="size-5" />
            {showBadge && (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 py-0.5 text-[10px] font-medium leading-none text-white">
                {displayBadgeCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute top-full right-0 mt-1 w-80 rounded-xl border border-[#E2E8F0] bg-white shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
                <span className="text-[13px] font-semibold text-[#0F172A]">通知</span>
                {notifications.length > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-[#2563EB] hover:underline">全部标为已读</button>
                )}
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12px] text-[#94A3B8]">暂无通知</div>
                ) : notifications.map(n => (
                  <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-[#F8FAFC] last:border-0 ${!n.read ? 'bg-blue-50/30' : ''}`}>
                    <div className="mt-0.5">
                      {n.icon === 'report' && <FileText size={14} className="text-[#2563EB]" />}
                      {n.icon === 'paper' && <Rss size={14} className="text-[#14B8A6]" />}
                      {n.icon === 'risk' && <AlertTriangle size={14} className="text-[#F97316]" />}
                      {n.icon === 'error' && <FileWarning size={14} className="text-[#EF4444]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />}
                        <span className="text-[12px] font-medium text-[#0F172A]">{n.title}</span>
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-0.5">{n.desc}</p>
                      <span className="text-[10px] text-[#94A3B8]">{n.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings} className="flex items-center justify-center rounded-[12px] p-2 text-[#334155] transition-colors duration-200 hover:bg-[#F1F5F9]" aria-label="自动化设置">
            <Settings size={18} />
          </button>
        )}

        {onViewReport && (
          <button type="button" onClick={onViewReport} className="flex items-center gap-1.5 rounded-[12px] border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm font-medium text-[#334155] transition-all duration-200 hover:bg-[#F8FAFC] hover:border-[#CBD5E1]">
            <FileText size={15} className="text-[#2563EB]" />
            <span>查看日报</span>
          </button>
        )}

        <button type="button" onClick={onGenerateReport} disabled={loading} className="flex items-center gap-2 rounded-[12px] bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed">
          <Sparkles className="size-4" />
          <span>{loading ? '生成中...' : '生成报告'}</span>
        </button>
      </div>
    </header>
  )
}
