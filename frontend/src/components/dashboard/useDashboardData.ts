/**
 * useDashboardData — hook that fetches real briefing data and maps it
 * to the dashboard component props. Replaces mock data with live API data.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchAutomationStatusToday, fetchBriefing, fetchBriefingHistory, fetchDailyStats, runTodayBriefing } from '../../lib/api'
import type { DailyStatsItem } from '../../lib/api'
import type {
  AutomationTodayStatus,
  BriefingPaperItem,
  DailyBriefingHistoryItem,
  DailyBriefingSnapshot,
  Paper,
} from '../../types'
import {
  BRIEFING_POLL_ATTEMPTS,
  BRIEFING_POLL_INTERVAL_MS,
  getBriefingGeneratedTime,
  getBriefingHighlights,
  getAutomationStatusLabel,
  isActiveRunStatus,
  sleep,
} from '../DailyBriefingShell.helpers'
import {
  buildDashboardNavigationItems,
  buildWeeklyData,
  estimateCompletionLabel,
  getPaperReadStatus,
  normalizeRelevanceScore,
} from './dashboardUtils'
import type { KpiCardProps } from './KpiCard'
import type { PriorityPaperCardProps } from './PriorityPaperCard'
import type { MockPaper, MockProgress, MockSuggestion, NavigationItemData } from './mockData'

// ─── Adapters / Mappers ─────────────────────────────────────────────

/** Map a Paper (from library) to the dashboard's MockPaper shape */
export function paperToMockPaper(paper: Paper, scoreMap: Map<number, number>): MockPaper {
  const rawScore = scoreMap.get(paper.id) ?? 0
  return {
    id: String(paper.id),
    title: paper.title,
    source: paper.source || paper.venue || '',
    date: paper.updated_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    citations: 0, // not available in old API
    tags: paper.tags ?? [],
    relevanceScore: normalizeRelevanceScore(rawScore),
    abstract: paper.abstract_raw ?? '',
    project: '', // not directly available
    isRead: getPaperReadStatus(paper),
    thumbnailUrl: '',
    favorite: paper.favorite ?? false,
  }
}

/** Map BriefingPaperItem to PriorityPaperCardProps */
export function briefingItemToPriorityCard(
  item: BriefingPaperItem,
  briefingDate: string,
  papers: Paper[],
  maxScore: number,
): Omit<PriorityPaperCardProps, 'onRead'> {
  const matchedPaper = item.paper_id !== null
    ? papers.find(p => p.id === item.paper_id)
    : undefined

  // Normalize score relative to the max score in the batch
  const normalizedScore = maxScore > 0 ? item.score / maxScore : 0

  return {
    rank: item.rank,
    paperId: item.paper_id !== null ? String(item.paper_id) : undefined,
    title: item.title ?? matchedPaper?.title ?? '未知标题',
    source: item.source_kind ?? matchedPaper?.source ?? '',
    date: briefingDate,
    citations: 0,
    tags: matchedPaper?.tags ?? [],
    relevanceScore: normalizedScore,
    thumbnailUrl: '',
    favorite: matchedPaper?.favorite ?? false,
  }
}

/** Map BriefingPaperItem[] to SuggestionItemData-compatible MockSuggestion[] */
export function briefingItemsToSuggestions(
  items: BriefingPaperItem[],
  highlights: string[],
): MockSuggestion[] {
  const categories = ['待优先阅读', '研究趋势', '潜在风险'] as const
  const actionLabels = ['立即阅读', '查看趋势', '调整计划'] as const

  return items.slice(0, 3).map((item, index) => ({
    id: `suggestion-${item.rank}`,
    category: categories[index] ?? '待优先阅读',
    title: highlights[index] ?? item.title ?? item.reason ?? '优先关注',
    reason: item.reason || `该论文排名第 ${item.rank}，建议优先阅读。`,
    actionLabel: actionLabels[index] ?? '查看',
  }))
}

/** Build KPI metrics from briefing snapshot */
export function buildKpiMetrics(
  briefing: DailyBriefingSnapshot | null,
  riskCount: number,
): KpiCardProps[] {
  return [
    {
      label: '论文候选',
      value: briefing?.paper_count ?? 0,
      trend: '今日候选',
      icon: 'FileText',
      color: '#4F46E5',
    },
    {
      label: '相关项目',
      value: briefing?.project_count ?? 0,
      trend: '进行中项目',
      icon: 'Briefcase',
      color: '#14B8A6',
    },
    {
      label: '订阅源',
      value: briefing?.source_count ?? 0,
      trend: '正常更新中',
      icon: 'Rss',
      color: '#2563EB',
    },
    {
      label: '风险热点',
      value: riskCount,
      trend: riskCount > 0 ? '需要关注' : '暂无风险',
      icon: 'AlertTriangle',
      color: '#EF4444',
    },
  ]
}

/** Build progress data from papers and briefing */
export function buildProgress(
  papers: Paper[],
  briefing: DailyBriefingSnapshot | null,
  userTarget?: number | null,
  dailyStats: DailyStatsItem[] = [],
  minutesPerPaper = 20,
): MockProgress {
  // User-set target takes priority, then briefing paper_count, then papers.length, fallback 30
  const totalTarget = userTarget || (briefing?.paper_count ?? papers.length) || 30
  const readCount = papers.filter(p => getPaperReadStatus(p)).length
  const pendingCount = Math.max(0, totalTarget - readCount)
  const percentage = totalTarget > 0 ? Math.round((readCount / totalTarget) * 100) : 0

  return {
    readCount,
    pendingCount,
    totalTarget,
    percentage: Math.min(100, percentage),
    estimatedCompletion: estimateCompletionLabel(pendingCount, minutesPerPaper),
    weeklyData: buildWeeklyData(papers, dailyStats),
  }
}

// ─── Hook ───────────────────────────────────────────────────────────

export type DashboardData = {
  // Data
  papers: MockPaper[]
  kpiMetrics: KpiCardProps[]
  priorityPapers: Omit<PriorityPaperCardProps, 'onRead'>[]
  progress: MockProgress
  suggestions: MockSuggestion[]
  navigationItems: NavigationItemData[]

  // State
  loading: boolean
  error: string
  runningToday: boolean
  briefing: DailyBriefingSnapshot | null
  automationStatus: AutomationTodayStatus | null
  statusLabel: string
  generatedAtTime: string
  briefingDate: string
  history: DailyBriefingHistoryItem[]
  riskCount: number

  // Actions
  handleRunToday: () => void
  handleSelectDate: (date: string) => void
  setReadingPlan: (target: number, minutesPerPaper: number) => void
  openPaper: (paperId: number) => void
}

export function useDashboardData(
  papers: Paper[],
  onOpenPaper: (paperId: number) => void,
): DashboardData {
  const clientToday = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [selectedDate, setSelectedDate] = useState(clientToday)
  const [briefing, setBriefing] = useState<DailyBriefingSnapshot | null>(null)
  const [history, setHistory] = useState<DailyBriefingHistoryItem[]>([])
  const [automationStatus, setAutomationStatus] = useState<AutomationTodayStatus | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyStatsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [runningToday, setRunningToday] = useState(false)
  const [userTarget, setUserTarget] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('dashboard_daily_target')
      return saved ? parseInt(saved, 10) : null
    } catch { return null }
  })
  const [minutesPerPaper, setMinutesPerPaper] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard_minutes_per_paper')
      const parsed = saved ? parseInt(saved, 10) : NaN
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 20
    } catch { return 20 }
  })

  const serverToday = automationStatus?.local_today ?? clientToday

  // ─── Load data on mount and date change ───
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const statusData = await fetchAutomationStatusToday()
        if (cancelled) return
        setAutomationStatus(statusData)

        // If a run is currently active, resume polling
        if (statusData.today_run && isActiveRunStatus(statusData.today_run.status)) {
          setRunningToday(true)
          void resumePolling()
        }

        const [historyResult, briefingResult] = await Promise.allSettled([
          fetchBriefingHistory(),
          fetchBriefing(selectedDate === statusData.local_today ? undefined : selectedDate),
        ])

        if (cancelled) return
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value)
        if (briefingResult.status === 'fulfilled') {
          setBriefing(briefingResult.value)
        } else {
          setBriefing(null)
          setError(briefingResult.reason instanceof Error ? briefingResult.reason.message : '加载日报失败')
        }
      } catch (e) {
        if (!cancelled) {
          setBriefing(null)
          setError(e instanceof Error ? e.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [selectedDate])

  useEffect(() => {
    let cancelled = false
    async function loadDailyStats() {
      try {
        const data = await fetchDailyStats(7)
        if (!cancelled) setDailyStats(data)
      } catch {
        if (!cancelled) setDailyStats([])
      }
    }
    void loadDailyStats()
    return () => { cancelled = true }
  }, [])

  // Resume polling for an already-running task
  async function resumePolling() {
    try {
      for (let attempt = 0; attempt < BRIEFING_POLL_ATTEMPTS; attempt++) {
        const statusData = await fetchAutomationStatusToday()
        setAutomationStatus(statusData)
        const todayRun = statusData.today_run
        if (!todayRun || !isActiveRunStatus(todayRun.status)) {
          const [historyData, briefingData] = await Promise.all([
            fetchBriefingHistory(),
            fetchBriefing(),
          ])
          setHistory(historyData)
          setBriefing(briefingData)
          if (todayRun?.error_message) {
            setError(`日报生成完成，但部分订阅源出错: ${todayRun.error_message}`)
          } else if (todayRun?.subscription_issues && todayRun.subscription_issues.length > 0) {
            setError(`日报已生成，${todayRun.subscription_issues.length} 个订阅源获取失败（可能是 API 限流）`)
          }
          break
        }
        await sleep(BRIEFING_POLL_INTERVAL_MS)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成报告失败')
    } finally {
      setRunningToday(false)
    }
  }

  // ─── Run today (generate report) ───
  async function handleRunToday() {
    if (runningToday) return
    setRunningToday(true)
    setError('')
    try {
      const run = await runTodayBriefing()
      // Poll for completion
      for (let attempt = 0; attempt < BRIEFING_POLL_ATTEMPTS; attempt++) {
        const statusData = await fetchAutomationStatusToday()
        setAutomationStatus(statusData)
        const todayRun = statusData.today_run
        if (!todayRun || !isActiveRunStatus(todayRun.status)) {
          // Done — refresh briefing
          const [historyData, briefingData] = await Promise.all([
            fetchBriefingHistory(),
            fetchBriefing(),
          ])
          setHistory(historyData)
          setBriefing(briefingData)
          // Check if there were errors during the run
          if (todayRun?.error_message) {
            setError(`日报生成完成，但部分订阅源出错: ${todayRun.error_message}`)
          } else if (todayRun?.subscription_issues && todayRun.subscription_issues.length > 0) {
            setError(`日报已生成，${todayRun.subscription_issues.length} 个订阅源获取失败（可能是 API 限流）`)
          }
          break
        }
        await sleep(BRIEFING_POLL_INTERVAL_MS)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成报告失败')
    } finally {
      setRunningToday(false)
    }
  }

  // ─── Derived data ───
  const subscriptionIssues = automationStatus?.today_run?.subscription_issues ?? []
  const riskCount = subscriptionIssues.length + (briefing?.failed_items?.length ?? 0) + (error ? 1 : 0)

  // Score map for paper relevance
  const scoreMap = useMemo(() => {
    const map = new Map<number, number>()
    if (!briefing?.top_papers?.length) return map

    // Find max score to normalize relative to it
    const maxScore = Math.max(...briefing.top_papers.map(item => item.score), 1)

    for (const item of briefing.top_papers) {
      if (item.paper_id !== null) {
        // Normalize: score / maxScore gives 0-1 range where top paper = 1.0
        map.set(item.paper_id, item.score / maxScore)
      }
    }
    return map
  }, [briefing?.top_papers])

  // Map papers to dashboard format
  const dashboardPapers: MockPaper[] = useMemo(() => {
    return papers.map(p => paperToMockPaper(p, scoreMap))
  }, [papers, scoreMap])

  // KPI metrics
  const kpiMetrics = useMemo(() => buildKpiMetrics(briefing, riskCount), [briefing, riskCount])

  // Priority papers (from top_papers)
  const priorityPapers = useMemo(() => {
    if (!briefing || briefing.top_papers.length === 0) return []
    const maxScore = Math.max(...briefing.top_papers.map(item => item.score), 1)
    return briefing.top_papers
      .slice(0, 3)
      .map(item => briefingItemToPriorityCard(item, briefing.briefing_date, papers, maxScore))
  }, [briefing, papers])

  // Progress
  const progress = useMemo(
    () => buildProgress(papers, briefing, userTarget, dailyStats, minutesPerPaper),
    [papers, briefing, userTarget, dailyStats, minutesPerPaper],
  )

  const navigationItems = useMemo(
    () => buildDashboardNavigationItems({ papers, briefing, riskCount }),
    [papers, briefing, riskCount],
  )

  // Suggestions
  const suggestions = useMemo(() => {
    if (!briefing || briefing.top_papers.length === 0) return []
    const highlights = getBriefingHighlights(briefing.summary_markdown, briefing.top_papers)
    return briefingItemsToSuggestions(briefing.top_papers, highlights)
  }, [briefing])

  // Status
  const statusLabel = getAutomationStatusLabel(automationStatus)
  const generatedAtTime = briefing ? getBriefingGeneratedTime(briefing.generated_at) : '--:--'
  const briefingDate = briefing?.briefing_date ?? selectedDate

  return {
    papers: dashboardPapers,
    kpiMetrics,
    priorityPapers,
    progress,
    suggestions,
    navigationItems,
    loading,
    error,
    runningToday,
    briefing,
    automationStatus,
    statusLabel,
    generatedAtTime,
    briefingDate,
    history,
    riskCount,
    handleRunToday: () => void handleRunToday(),
    handleSelectDate: setSelectedDate,
    setReadingPlan: (target: number, nextMinutesPerPaper: number) => {
      setUserTarget(target)
      setMinutesPerPaper(nextMinutesPerPaper)
      localStorage.setItem('dashboard_daily_target', String(target))
      localStorage.setItem('dashboard_minutes_per_paper', String(nextMinutesPerPaper))
    },
    openPaper: onOpenPaper,
  }
}
