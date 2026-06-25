import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
import type { AutomationSubscriptionIssue, DailyBriefingSnapshot, Paper } from '../../types'
import { DashboardTopbar, type DashboardNotification } from './DashboardTopbar'
import { DashboardContent } from './DashboardContent'
import { DashboardToastContainer, showToast } from './DashboardToast'
import { DashboardContentSkeleton } from './DashboardSkeleton'
import { DailyReportDrawer } from './DailyReportDrawer'
import { AutomationSettingsDialog, PlanAdjustmentDialog, AddToProjectDialog } from './DashboardDialogs'
import { useDashboardData } from './useDashboardData'

export type WorkDashboardPageProps = {
  papers?: Paper[]
  refreshLibrary?: () => Promise<void>
}

export function WorkDashboardPage({ papers = [], refreshLibrary }: WorkDashboardPageProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false)
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [addToProjectOpen, setAddToProjectOpen] = useState(false)
  const [addToProjectTitle, setAddToProjectTitle] = useState('')

  const dashboard = useDashboardData(papers, (paperId) => {
    navigate(`/paper/${paperId}`)
  }, refreshLibrary)
  const notifications = useMemo(
    () => buildDashboardNotifications({
      papers,
      briefing: dashboard.briefing,
      runningToday: dashboard.runningToday,
      error: dashboard.error,
      subscriptionIssues: dashboard.automationStatus?.today_run?.subscription_issues ?? [],
      progressMessage: dashboard.automationStatus?.today_run?.progress_message,
      runProgress: dashboard.automationStatus?.today_run?.progress ?? 0,
    }),
    [papers, dashboard.briefing, dashboard.runningToday, dashboard.error, dashboard.automationStatus],
  )

  // Detect when generation completes and show toast
  const wasRunning = useRef(false)
  useEffect(() => {
    if (dashboard.runningToday) {
      wasRunning.current = true
    } else if (wasRunning.current) {
      wasRunning.current = false
      if (dashboard.error) {
        showToast(dashboard.error, 'error')
      } else {
        showToast('日报生成完成！点击"查看日报"查看详情', 'success')
      }
      // Refresh papers data after generation
      refreshLibrary?.()
    }
  }, [dashboard.runningToday])

  function handleSearch(query: string) {
    setSearchQuery(query)
  }

  function handleGenerateReport() {
    if (dashboard.runningToday) return
    dashboard.handleRunToday()
    showToast('正在生成日报，完成后可点击"查看日报"查看', 'info')
  }

  function handleOpenAddToProject(paperTitle: string) {
    setAddToProjectTitle(paperTitle)
    setAddToProjectOpen(true)
  }

  return (
    <div
      className="flex flex-col min-h-full relative z-10"
      style={{
        background: 'linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 100%)',
        color: '#0F172A',
        '--input-bg': '#FFFFFF',
        '--input-border': '#E2E8F0',
        '--input-focus-border': '#2563EB',
        '--text-primary': '#0F172A',
        '--text-secondary': '#64748B',
        '--text-muted': '#94A3B8',
        '--bg-page': '#FFFFFF',
        '--border-subtle': '#E2E8F0',
      } as React.CSSProperties}
      data-theme="light"
    >
      {/* Topbar */}
      <DashboardTopbar
        searchPlaceholder="搜索论文、项目或关键词..."
        unreadCount={dashboard.kpiMetrics[3]?.value ?? 0}
        workspace={{
          label: '当前工作区',
          timezone: dashboard.automationStatus?.timezone ?? 'Asia/Shanghai',
        }}
        onGenerateReport={handleGenerateReport}
        onSearch={handleSearch}
        notifications={notifications}
        loading={dashboard.runningToday}
        onViewReport={() => setReportDrawerOpen(true)}
        onOpenSettings={() => setAutomationDialogOpen(true)}
      />

      {/* Generation progress bar */}
      {dashboard.runningToday && (
        <div className="px-6 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[13px] font-medium text-blue-700">
                {dashboard.automationStatus?.today_run?.progress_message || '正在生成日报...'}
              </span>
            </div>
            <div className="flex-1">
              <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
                {(dashboard.automationStatus?.today_run?.progress ?? 0) > 0 ? (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${dashboard.automationStatus?.today_run?.progress ?? 0}%` }}
                  />
                ) : (
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
                )}
              </div>
            </div>
            <span className="text-[12px] font-semibold text-blue-600 shrink-0">
              {(dashboard.automationStatus?.today_run?.progress ?? 0) > 0
                ? `${dashboard.automationStatus?.today_run?.progress}%`
                : '请稍候'}
            </span>
          </div>
        </div>
      )}

      {/* Error banner after generation */}
      {!dashboard.runningToday && dashboard.error && (
        <div className="px-6 py-2">
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5">
            <span className="text-[13px] text-amber-700">{dashboard.error}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-auto text-[12px] text-amber-600 hover:text-amber-800 font-medium"
            >刷新</button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {dashboard.loading && !dashboard.briefing ? (
          <DashboardContentSkeleton />
        ) : dashboard.error && !dashboard.briefing ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="text-[#EF4444] text-[13px]">{dashboard.error}</div>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC]"
            >
              重试
            </button>
          </div>
        ) : (
          <DashboardContent
            papers={dashboard.papers}
            kpiMetrics={dashboard.kpiMetrics}
            briefing={dashboard.briefing}
            rawPapers={papers}
            subscriptionIssues={dashboard.automationStatus?.today_run?.subscription_issues ?? []}
            dashboardError={dashboard.error}
            priorityPapers={dashboard.priorityPapers}
            progress={dashboard.progress}
            suggestions={dashboard.suggestions}
            onOpenPaper={dashboard.openPaper}
            briefingDate={dashboard.briefingDate}
            generatedAtTime={dashboard.generatedAtTime}
            readingProgress={dashboard.progress.percentage}
            searchQuery={searchQuery}
            onViewReport={() => setReportDrawerOpen(true)}
            onOpenSettings={() => setAutomationDialogOpen(true)}
            onAdjustPlan={() => setPlanDialogOpen(true)}
            onAddToProject={handleOpenAddToProject}
            onRefreshData={refreshLibrary}
          />
        )}
      </div>

      {/* Dialogs & Drawers */}
      <DailyReportDrawer
        open={reportDrawerOpen}
        onOpenChange={setReportDrawerOpen}
        briefing={dashboard.briefing}
        papers={papers}
        loading={dashboard.loading}
        error={dashboard.error}
        onGenerateReport={handleGenerateReport}
        runningToday={dashboard.runningToday}
      />

      <AutomationSettingsDialog open={automationDialogOpen} onOpenChange={setAutomationDialogOpen} />
      <PlanAdjustmentDialog open={planDialogOpen} onOpenChange={setPlanDialogOpen} onSave={dashboard.setReadingPlan} />
      <AddToProjectDialog open={addToProjectOpen} onOpenChange={setAddToProjectOpen} paperTitle={addToProjectTitle} />

      <DashboardToastContainer />
    </div>
  )
}

type DashboardNotificationContext = {
  papers: Paper[]
  briefing: DailyBriefingSnapshot | null
  runningToday: boolean
  error: string
  subscriptionIssues: AutomationSubscriptionIssue[]
  progressMessage?: string
  runProgress: number
}

function buildDashboardNotifications({
  papers,
  briefing,
  runningToday,
  error,
  subscriptionIssues,
  progressMessage,
  runProgress,
}: DashboardNotificationContext): DashboardNotification[] {
  const notifications: DashboardNotification[] = []

  if (runningToday) {
    notifications.push({
      id: 'briefing-run-active',
      title: '日报生成中',
      desc: progressMessage || '正在生成今日日报',
      time: runProgress > 0 ? `${runProgress}%` : '进行中',
      read: false,
      icon: 'report',
    })
  } else if (briefing) {
    notifications.push({
      id: `briefing-${briefing.briefing_date}-${briefing.generated_at}`,
      title: '日报已生成',
      desc: `${briefing.briefing_date} 汇总 ${briefing.paper_count} 篇论文候选`,
      time: formatRelativeTime(briefing.generated_at),
      read: false,
      icon: 'report',
    })
  }

  if (briefing && briefing.paper_count > 0) {
    notifications.push({
      id: `paper-candidates-${briefing.briefing_date}-${briefing.paper_count}`,
      title: `今日 ${briefing.paper_count} 篇候选论文`,
      desc: briefing.source_count > 0 ? `来自 ${briefing.source_count} 个订阅源` : '来自今日扫描结果',
      time: briefing.generated_at ? formatRelativeTime(briefing.generated_at) : '今日',
      read: false,
      icon: 'paper',
    })
  }

  if (subscriptionIssues.length > 0) {
    notifications.push({
      id: `subscription-issues-${subscriptionIssues.length}`,
      title: '订阅源需要关注',
      desc: `${subscriptionIssues.length} 个订阅源获取异常`,
      time: '今日',
      read: false,
      icon: 'risk',
    })
  }

  const failedCount = (briefing?.failed_items?.length ?? 0) + papers.filter((paper) => (
    paper.status === 'failed'
    || paper.parse_status === 'failed'
    || paper.summary_status === 'failed'
    || paper.embedding_status === 'failed'
  )).length

  if (failedCount > 0 || error) {
    notifications.push({
      id: `dashboard-errors-${failedCount}-${error}`,
      title: '处理异常提醒',
      desc: error || `${failedCount} 篇论文处理失败或待重试`,
      time: '刚刚',
      read: false,
      icon: 'error',
    })
  }

  return notifications.slice(0, 6)
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近'
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
