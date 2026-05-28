import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronDown,
  FileText,
  FileWarning,
  MapPin,
  RefreshCcw,
  Rss,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { showToast } from '../dashboard/DashboardToast'

export type TrackingTopbarProps = {
  searchValue?: string
  rangeDays?: number
  timezone?: string
  onSearch: (query: string) => void
  onClearSearch?: () => void
  onViewReport?: () => void
  onOpenSettings?: () => void
  onRefresh?: () => Promise<void> | void
  onRangeChange?: (days: number) => void
}

const mockNotifications = [
  { id: 1, title: '日报生成完成', desc: '每日速览已生成，可进入日报查看', time: '2分钟前', read: true, icon: 'report' as const },
  { id: 2, title: '新增订阅论文', desc: '订阅源有新的候选论文进入文库', time: '15分钟前', read: true, icon: 'paper' as const },
  { id: 3, title: '处理队列提醒', desc: '部分论文仍在等待解析或摘要生成', time: '1小时前', read: true, icon: 'risk' as const },
  { id: 4, title: '解析失败提醒', desc: '若有失败论文，可进入论文管理页重试', time: '3小时前', read: true, icon: 'error' as const },
]

const rangeOptions = [7, 14, 30]

function loadNotifications() {
  try {
    const saved = localStorage.getItem('tracking_notifications_read')
    if (saved) {
      const readIds = JSON.parse(saved) as number[]
      return mockNotifications.map((notification) => ({
        ...notification,
        read: notification.read || readIds.includes(notification.id),
      }))
    }
  } catch {
    // ignore localStorage failures
  }
  return mockNotifications
}

function saveReadState(notifications: typeof mockNotifications) {
  try {
    const readIds = notifications.filter((notification) => notification.read).map((notification) => notification.id)
    localStorage.setItem('tracking_notifications_read', JSON.stringify(readIds))
  } catch {
    // ignore localStorage failures
  }
}

export function TrackingTopbar({
  searchValue,
  rangeDays = 7,
  timezone = 'Asia/Shanghai',
  onSearch,
  onClearSearch,
  onViewReport,
  onOpenSettings,
  onRefresh,
  onRangeChange,
}: TrackingTopbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [updatedAt, setUpdatedAt] = useState(() => formatUpdateTime(new Date()))
  const [notifications, setNotifications] = useState(loadNotifications)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLDivElement>(null)
  const searchQuery = searchValue ?? internalSearchQuery

  // ⌘K / Ctrl+K keyboard shortcut to focus search
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

  // Online/offline status listener
  useEffect(() => {
    function goOnline() { setIsOnline(true) }
    function goOffline() { setIsOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (notificationRef.current && !notificationRef.current.contains(target)) setNotificationOpen(false)
      if (workspaceRef.current && !workspaceRef.current.contains(target)) setWorkspaceOpen(false)
      if (rangeRef.current && !rangeRef.current.contains(target)) setRangeOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (searchValue === undefined) {
      setInternalSearchQuery(value)
    }
    onSearch(value)
  }

  function handleClearSearch() {
    if (searchValue === undefined) {
      setInternalSearchQuery('')
    }
    onClearSearch?.()
    onSearch('')
    searchInputRef.current?.focus()
  }

  function markAllRead() {
    const updated = notifications.map((notification) => ({ ...notification, read: true }))
    setNotifications(updated)
    saveReadState(updated)
    showToast('已全部标为已读', 'success')
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh?.()
      setUpdatedAt(formatUpdateTime(new Date()))
    } catch {
      showToast('刷新统计失败，请稍后重试', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  function handleRangeSelect(days: number) {
    onRangeChange?.(days)
    setRangeOpen(false)
    showToast(`已切换到近 ${days} 天统计`, 'success')
  }

  const displayCount = notifications.filter((notification) => !notification.read).length
  const displayBadge = displayCount > 99 ? '99+' : String(displayCount)

  return (
    <section className="academic-tracking-topbar-stack" aria-label="学术追踪工具栏">
      <header className="academic-tracking-topbar" role="banner">
        <div className="academic-tracking-title-block">
          <h1>学术追踪</h1>
          <p>查看论文处理进度、统计结果和近期变化。</p>
        </div>

        <div className="relative academic-tracking-search">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2"
            size={16}
            style={{ color: '#94A3B8' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="搜索论文、项目、订阅源或关键词"
            maxLength={200}
            style={{
              width: '100%',
              height: 40,
              paddingLeft: 36,
              paddingRight: 52,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              background: 'var(--input-bg, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              border: '1px solid var(--input-border, #E2E8F0)',
              borderRadius: '12px',
              outline: 'none',
              transition: 'border-color var(--transition-fast, 150ms)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-focus-border, rgba(37,99,235,0.5))'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border, #E2E8F0)'
            }}
            aria-label="搜索论文、项目、订阅源或关键词"
          />
          {searchQuery ? (
            <button
              type="button"
              className="academic-tracking-search-clear"
              onClick={handleClearSearch}
              aria-label="清空搜索"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="academic-tracking-search-kbd">⌘K</kbd>
          )}
        </div>

        <div className="flex items-center academic-tracking-topbar-actions">
          <div
            className="academic-tracking-status-pill"
            data-online={isOnline ? 'true' : 'false'}
          >
            <span />
            <strong>{isOnline ? '在线' : '离线'}</strong>
          </div>

          <div className="relative" ref={workspaceRef}>
            <button
              type="button"
              className="academic-tracking-timezone"
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
              aria-expanded={workspaceOpen}
              aria-label="当前工作区和时区"
            >
              <MapPin size={14} />
              <span>{timezone}</span>
              <ChevronDown size={13} />
            </button>
            {workspaceOpen && (
              <div className="academic-tracking-popover academic-tracking-popover--workspace">
                <div className="academic-tracking-popover-title">工作区状态</div>
                <div className="academic-tracking-popover-status">
                  <span />
                  在线运行中
                </div>
                <div className="academic-tracking-popover-note">时区：{timezone}</div>
                <button
                  type="button"
                  className="academic-tracking-popover-action"
                  onClick={() => {
                    setWorkspaceOpen(false)
                    onOpenSettings?.()
                  }}
                >
                  <Settings size={13} />
                  自动化设置
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              className="relative academic-tracking-icon-button"
              onClick={() => setNotificationOpen(!notificationOpen)}
              aria-expanded={notificationOpen}
              aria-label="通知"
            >
              <Bell size={18} />
              {displayCount > 0 && (
                <span className="academic-tracking-notification-badge">
                  {displayBadge}
                </span>
              )}
            </button>
            {notificationOpen && (
              <div className="academic-tracking-popover academic-tracking-popover--notifications">
                <div className="academic-tracking-popover-header">
                  <strong>通知</strong>
                  <button type="button" onClick={markAllRead}>全部标为已读</button>
                </div>
                <div className="academic-tracking-notification-list">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="academic-tracking-notification-item"
                      data-unread={!notification.read}
                    >
                      <span className="academic-tracking-notification-icon">
                        {notification.icon === 'report' && <FileText size={14} />}
                        {notification.icon === 'paper' && <Rss size={14} />}
                        {notification.icon === 'risk' && <AlertTriangle size={14} />}
                        {notification.icon === 'error' && <FileWarning size={14} />}
                      </span>
                      <span>
                        <strong>{notification.title}</strong>
                        <em>{notification.desc}</em>
                        <small>{notification.time}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {onOpenSettings && (
            <button
              type="button"
              className="academic-tracking-icon-button"
              onClick={onOpenSettings}
              aria-label="自动化设置"
            >
              <Settings size={17} />
            </button>
          )}

          {onViewReport && (
            <button
              type="button"
              className="academic-tracking-secondary-action"
              onClick={onViewReport}
            >
              <FileText size={15} />
              <span>查看日报</span>
            </button>
          )}

        </div>
      </header>

      <div className="academic-tracking-filter-row">
        <div className="relative" ref={rangeRef}>
          <button
            type="button"
            className="academic-tracking-range-button"
            onClick={() => setRangeOpen(!rangeOpen)}
            aria-expanded={rangeOpen}
          >
            <CalendarDays size={14} />
            <span>近 {rangeDays} 天</span>
            <ChevronDown size={13} />
          </button>
          {rangeOpen && (
            <div className="academic-tracking-popover academic-tracking-popover--range">
              {rangeOptions.map((days) => (
                <button
                  key={days}
                  type="button"
                  className="academic-tracking-range-option"
                  data-active={days === rangeDays}
                  onClick={() => handleRangeSelect(days)}
                >
                  近 {days} 天
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="academic-tracking-refresh-status">更新于 {updatedAt}</span>
        <button
          type="button"
          className="academic-tracking-icon-button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="刷新统计数据"
        >
          <RefreshCcw size={15} className={refreshing ? 'academic-tracking-spin' : undefined} />
        </button>
      </div>
    </section>
  )
}

function formatUpdateTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
