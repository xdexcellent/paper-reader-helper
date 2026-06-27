import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/AuthContext'
import {
  Plus,
  LayoutDashboard,
  Bot,
  Radar,
  FolderOpen,
  Sparkles,
  Library,
  Download,
  User,
  Settings,
  Palette,
  RefreshCw,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import type { NavigationItemData } from './mockData'
import { showToast } from './DashboardToast'
import { LiteratureSettingsDialog, PreferencesDialog, UserPreferencesDialog } from './DashboardDialogs'

// --- Types ---

export type DashboardSidebarProps = {
  navigationItems: NavigationItemData[]
  activeItemId: string
  researchProgress: { percentage: number; readCount: number; totalCount: number }
  user: { name: string; badge: string }
  onProgressClick?: () => void
  onStatsClick?: () => void
}

// --- Icon mapping ---

const iconMap: Record<string, LucideIcon> = {
  Plus,
  LayoutDashboard,
  Bot,
  Radar,
  FolderOpen,
  Sparkles,
  Library,
  Download,
}

// --- Sub-components ---

function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-5 py-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      </div>
      <div>
        <h1 className="text-sm font-semibold text-[#0F172A]">论文阅读器</h1>
        <p className="text-xs text-[#64748B]">AI 驱动的学术研究助手</p>
      </div>
    </div>
  )
}

function NavigationItem({
  item,
  isActive,
}: {
  item: NavigationItemData
  isActive: boolean
}) {
  const Icon = iconMap[item.icon]
  const highlight = item.highlight

  return (
    <Link
      to={item.path}
      className={cn(
        'group flex items-center gap-3 px-5 py-2.5 transition-colors duration-200',
        highlight
          ? cn(
              'mx-3 my-0.5 rounded-lg border font-semibold',
              isActive
                ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm'
                : 'border-blue-200 bg-blue-50 text-[#2563EB] hover:bg-blue-100 hover:border-blue-300'
            )
          : cn(
              'border-l-[3px]',
              isActive
                ? 'border-l-[#2563EB] bg-gradient-to-r from-blue-50 to-transparent text-[#2563EB]'
                : 'border-l-transparent text-[#334155] hover:bg-slate-50'
            )
      )}
    >
      {Icon && (
        <Icon
          size={18}
          className={cn(
            'shrink-0',
            highlight
              ? isActive ? 'text-white' : 'text-[#2563EB]'
              : isActive ? 'text-[#2563EB]' : 'text-[#64748B] group-hover:text-[#334155]'
          )}
        />
      )}
      <div className="min-w-0">
        <span
          className={cn(
            'block text-sm leading-tight',
            highlight
              ? cn('font-semibold', isActive ? 'text-white' : 'text-[#2563EB]')
              : cn('font-medium', isActive ? 'text-[#2563EB]' : 'text-[#334155]')
          )}
        >
          {item.label}
        </span>
        <span
          className={cn(
            'block truncate text-xs',
            highlight && isActive ? 'text-blue-100' : 'text-[#94A3B8]'
          )}
        >
          {item.subtitle}
        </span>
      </div>
    </Link>
  )
}

function ResearchProgressCard({
  percentage,
  readCount,
  totalCount,
}: {
  percentage: number
  readCount: number
  totalCount: number
}) {
  // SVG circular progress
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="mx-4 rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 shadow-sm">
      <p className="mb-3 text-xs font-medium text-[#64748B]">研究进度</p>
      <div className="flex items-center gap-3">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg width="64" height="64" className="-rotate-90">
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="5"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="#2563EB"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <span className="absolute text-xs font-semibold text-[#0F172A]">
            {percentage}%
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-[#334155]">
            本周阅读 {readCount}/{totalCount} 篇
          </p>
          <Link
            to="/stats"
            className="mt-1 inline-block text-xs text-[#2563EB] hover:underline"
            onClick={(e) => { e.stopPropagation() }}
          >
            查看详细统计 →
          </Link>
        </div>
      </div>
    </div>
  )
}

function UserInfoBlock({ name, badge }: { name: string; badge: string }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [literatureSettingsOpen, setLiteratureSettingsOpen] = useState(false)
  const [userPreferencesOpen, setUserPreferencesOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[#F8FAFC]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#4F46E5] text-xs font-medium text-white">
          {name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#0F172A]">{name}</p>
          <span className="inline-block rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-medium text-[#4F46E5]">
            {badge}
          </span>
        </div>
      </button>
      {menuOpen && (
        <div className="absolute bottom-full left-4 mb-1 w-44 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg z-50">
          <button onClick={() => { setMenuOpen(false); showToast('个人资料功能开发中', 'info') }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <User size={13} />个人资料
          </button>
          <button onClick={() => { setMenuOpen(false); setPreferencesOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <Settings size={13} />AI 供应商配置
          </button>
          <button onClick={() => { setMenuOpen(false); setLiteratureSettingsOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <Sparkles size={13} />文献信息设置
          </button>
          <button onClick={() => { setMenuOpen(false); setUserPreferencesOpen(true) }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <User size={13} />偏好设置
          </button>
          <button onClick={() => { setMenuOpen(false); showToast('主题切换功能开发中', 'info') }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <Palette size={13} />主题设置
          </button>
          <button onClick={() => { setMenuOpen(false); showToast('数据同步功能开发中', 'info') }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#334155] hover:bg-[#F8FAFC]">
            <RefreshCw size={13} />数据同步
          </button>
          <div className="my-1 border-t border-[#F1F5F9]" />
          <button onClick={() => { setMenuOpen(false); logout(); navigate('/') }} className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-red-50">
            <LogOut size={13} />退出登录
          </button>
        </div>
      )}
      <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
      <LiteratureSettingsDialog open={literatureSettingsOpen} onOpenChange={setLiteratureSettingsOpen} />
      <UserPreferencesDialog open={userPreferencesOpen} onOpenChange={setUserPreferencesOpen} />
    </div>
  )
}

// --- Main Component ---

export function DashboardSidebar({
  navigationItems,
  activeItemId,
  researchProgress,
  user,
  onProgressClick,
  onStatsClick,
}: DashboardSidebarProps) {
  const location = useLocation()

  function isItemActive(item: NavigationItemData): boolean {
    if (item.path === '/') return location.pathname === '/' || location.pathname.startsWith('/paper')
    if (location.pathname.startsWith('/paper')) return false
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  }

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-[240px] flex-col border-r border-[#E2E8F0] bg-[#FFFFFF]">
      {/* Logo */}
      <SidebarLogo />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navigationItems.map((item) => (
          <NavigationItem
            key={item.id}
            item={item}
            isActive={isItemActive(item)}
          />
        ))}
      </nav>

      {/* Research Progress Card — clickable */}
      <div className="px-0 pb-3 cursor-pointer" onClick={onProgressClick}>
        <ResearchProgressCard
          percentage={researchProgress.percentage}
          readCount={researchProgress.readCount}
          totalCount={researchProgress.totalCount}
        />
      </div>

      {/* User Info */}
      <div className="border-t border-[#E2E8F0]">
        <UserInfoBlock name={user.name} badge={user.badge} />
      </div>
    </aside>
  )
}
