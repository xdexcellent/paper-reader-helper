import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Clock,
  FileText,
  Layers,
  Loader,
  TrendingUp,
} from 'lucide-react'
import { fetchStatsOverview, fetchDailyStats, fetchSourceDist } from '../../lib/api'
import type { StatsOverview, DailyStatsItem, SourceDistItem } from '../../lib/api'
import type { Paper } from '../../types'
import { TrackingTopbar } from './TrackingTopbar'
import { TrackingKpiCard } from './TrackingKpiCard'
import { SourceDistributionCard } from './SourceDistributionCard'
import { ResearchRhythmCard } from './ResearchRhythmCard'
import { ImportTrendChart } from './ImportTrendChart'
import { CompletionTrendChart } from './CompletionTrendChart'
import { TopicDistributionCard } from './TopicDistributionCard'
import { RecentActivitiesTable } from './RecentActivitiesTable'
import { DailyReportDrawer } from '../dashboard/DailyReportDrawer'
import { AutomationSettingsDialog } from '../dashboard/DashboardDialogs'
import { DashboardToastContainer, showToast } from '../dashboard/DashboardToast'
import { useDashboardData } from '../dashboard/useDashboardData'
import { TrackingDetailDrawer, type TrackingDetailView } from './TrackingDetailDrawer'

export type AcademicTrackingPageProps = {
  papers: Paper[]
  refreshLibrary?: () => Promise<void>
}

// ─── KPI Configuration ──────────────────────────────────────
type KpiConfig = {
  key: string
  label: string
  getValue: (stats: StatsOverview) => number | string
  note: string | ((stats: StatsOverview) => string)
  icon: React.ReactNode
  iconColor: string
}

const kpiConfigs: KpiConfig[] = [
  {
    key: 'total',
    label: '总文章数',
    getValue: (s) => s.total,
    note: '论文库总量',
    icon: <FileText size={20} color="#2563EB" />,
    iconColor: '#2563EB',
  },
  {
    key: 'completion_rate',
    label: '处理完成率',
    getValue: (s) => s.completion_rate.toFixed(1) + '%',
    note: (s) => `${s.ready} 篇已就绪`,
    icon: <TrendingUp size={20} color="#14B8A6" />,
    iconColor: '#14B8A6',
  },
  {
    key: 'parsed',
    label: '结构提取',
    getValue: (s) => s.parsed,
    note: '已完成解析',
    icon: <Layers size={20} color="#10B981" />,
    iconColor: '#10B981',
  },
  {
    key: 'summarized',
    label: '摘要生成',
    getValue: (s) => s.summarized,
    note: '已生成摘要',
    icon: <BookOpen size={20} color="#8B5CF6" />,
    iconColor: '#8B5CF6',
  },
  {
    key: 'pending',
    label: '待处理队列',
    getValue: (s) => s.pending,
    note: '等待处理',
    icon: <Clock size={20} color="#F59E0B" />,
    iconColor: '#F59E0B',
  },
  {
    key: 'processing',
    label: '正在运行中',
    getValue: (s) => s.processing,
    note: '当前处理中',
    icon: <Loader size={20} color="#EF4444" />,
    iconColor: '#EF4444',
  },
]

export function AcademicTrackingPage({ papers, refreshLibrary }: AcademicTrackingPageProps) {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [dailyData, setDailyData] = useState<DailyStatsItem[]>([])
  const [sources, setSources] = useState<SourceDistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [rangeDays, setRangeDays] = useState(7)
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false)
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false)
  const [detailView, setDetailView] = useState<TrackingDetailView | null>(null)

  const dashboard = useDashboardData(papers, (paperId) => {
    navigate(`/paper/${paperId}`)
  })

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const isSearching = normalizedSearchQuery.length > 0

  const filteredPapers = useMemo(
    () => filterTrackingPapers(papers, normalizedSearchQuery),
    [papers, normalizedSearchQuery],
  )

  const filteredStats = useMemo(
    () => buildStatsFromPapers(filteredPapers),
    [filteredPapers],
  )

  const filteredSources = useMemo(
    () => buildSourceDistribution(filteredPapers),
    [filteredPapers],
  )

  const filteredDailyData = useMemo(
    () => buildDailyStats(filteredPapers, rangeDays),
    [filteredPapers, rangeDays],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [overview, daily, src] = await Promise.all([
        fetchStatsOverview(),
        fetchDailyStats(rangeDays),
        fetchSourceDist(),
      ])
      setStats(overview)
      setDailyData(daily)
      setSources(src)
    } catch {
      setError(true)
      // Fallback: compute stats from local papers
      const total = papers.length
      const ready = papers.filter(p => p.status === 'ready').length
      const parsed = papers.filter(p => p.parse_status === 'completed').length
      const summarized = papers.filter(p => p.summary_status === 'completed').length
      setStats({
        total,
        ready,
        parsed,
        summarized,
        pending: papers.filter(p => p.status === 'queued').length,
        processing: papers.filter(p => p.status === 'parsing' || p.status === 'summarizing').length,
        completion_rate: total > 0 ? Math.round((ready / total) * 100) : 0,
      })
      // Set chart/source data to empty on API failure
      setDailyData([])
      setSources([])
    } finally {
      setLoading(false)
    }
  }, [papers, rangeDays])

  useEffect(() => {
    loadData()
  }, [loadData])

  const wasRunningReport = useRef(false)
  useEffect(() => {
    if (dashboard.runningToday) {
      wasRunningReport.current = true
      return
    }

    if (!wasRunningReport.current) return
    wasRunningReport.current = false
    if (dashboard.error) {
      showToast(dashboard.error, 'error')
    } else {
      showToast('日报生成完成，可点击“查看日报”查看详情', 'success')
    }
    refreshLibrary?.()
  }, [dashboard.runningToday, dashboard.error, refreshLibrary])

  // Topbar handlers
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const handleGenerateReport = useCallback(() => {
    if (dashboard.runningToday) return
    dashboard.handleRunToday()
    showToast('正在生成日报，完成后可点击“查看日报”查看', 'info')
  }, [dashboard])

  const handleRefresh = useCallback(async () => {
    await loadData()
    await refreshLibrary?.()
    showToast('学术追踪数据已刷新', 'success')
  }, [loadData, refreshLibrary])

  const handleOpenPaper = useCallback((paperId: number) => {
    navigate(`/paper/${paperId}`)
  }, [navigate])

  const displayStats = isSearching ? filteredStats : stats
  const displaySources = isSearching ? filteredSources : sources
  const displayDailyData = isSearching ? filteredDailyData : dailyData
  const displayPapers = isSearching ? filteredPapers : papers

  return (
    <div className="academic-tracking-shell">
      <main className="academic-tracking-page" style={pageStyle}>
        <TrackingTopbar
          searchValue={searchQuery}
          rangeDays={rangeDays}
          timezone={dashboard.automationStatus?.timezone ?? 'Asia/Shanghai'}
          onSearch={handleSearch}
          onClearSearch={() => setSearchQuery('')}
          onViewReport={() => setReportDrawerOpen(true)}
          onOpenSettings={() => setAutomationDialogOpen(true)}
          onRefresh={handleRefresh}
          onRangeChange={setRangeDays}
        />

        {isSearching && (
          <div className="academic-tracking-search-summary" role="status">
            <span>
              搜索 “{searchQuery.trim()}”：匹配 {filteredPapers.length} / {papers.length} 篇论文
            </span>
            <button type="button" onClick={() => setSearchQuery('')}>清空搜索</button>
          </div>
        )}

        <div className="academic-tracking-kpi-grid">
          {kpiConfigs.map((kpi) => {
            const value = displayStats ? kpi.getValue(displayStats) : 0
            const note = displayStats
              ? typeof kpi.note === 'function' ? kpi.note(displayStats) : kpi.note
              : ''
            return (
              <TrackingKpiCard
                key={kpi.key}
                label={kpi.label}
                value={value}
                note={note}
                icon={kpi.icon}
                iconColor={kpi.iconColor}
                loading={loading}
                error={error && !stats}
                onRetry={loadData}
              />
            )
          })}
        </div>

        {!loading && (
          <>
            <div className="academic-tracking-dual-grid">
              <SourceDistributionCard
                sources={displaySources}
                loading={false}
                onViewDetails={() => setDetailView('sources')}
              />
              <ResearchRhythmCard dailyData={displayDailyData} loading={false} rangeDays={rangeDays} />
            </div>

            <div className="academic-tracking-chart-grid">
              <ImportTrendChart
                data={displayDailyData}
                loading={false}
                rangeDays={rangeDays}
                onViewDetails={() => setDetailView('imports')}
              />
              <CompletionTrendChart
                data={displayDailyData}
                loading={false}
                rangeDays={rangeDays}
                onViewDetails={() => setDetailView('completion')}
              />
              <TopicDistributionCard
                sources={displaySources}
                loading={false}
                onViewAll={() => setDetailView('topics')}
              />
            </div>

            <RecentActivitiesTable
              papers={displayPapers}
              loading={false}
              onViewAll={() => setDetailView('activities')}
            />
          </>
        )}
      </main>

      {dashboard.runningToday && (
        <div className="academic-tracking-report-progress" role="status">
          <span />
          <strong>{dashboard.automationStatus?.today_run?.progress_message || '正在生成日报...'}</strong>
          <em>
            {(dashboard.automationStatus?.today_run?.progress ?? 0) > 0
              ? `${dashboard.automationStatus?.today_run?.progress}%`
              : '请稍候'}
          </em>
        </div>
      )}

      <TrackingDetailDrawer
        open={detailView !== null}
        view={detailView}
        onOpenChange={(open) => {
          if (!open) setDetailView(null)
        }}
        sources={displaySources}
        dailyData={displayDailyData}
        papers={displayPapers}
        stats={displayStats}
        rangeDays={rangeDays}
        searchQuery={searchQuery}
        onOpenPaper={handleOpenPaper}
      />

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
      <DashboardToastContainer />
    </div>
  )
}

// ─── Inline Styles ──────────────────────────────────────────
// Page-level styles applied via inline style object to match the design spec.
// Responsive padding and gap are handled via CSS class below.
const pageStyle: React.CSSProperties = {
  background: 'transparent',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
}

function filterTrackingPapers(papers: Paper[], normalizedQuery: string): Paper[] {
  if (!normalizedQuery) return papers

  return papers.filter((paper) => {
    const searchableFields = [
      paper.title,
      paper.source,
      paper.authors ?? '',
      paper.abstract_raw ?? '',
      paper.venue ?? '',
      paper.doi ?? '',
      paper.url ?? '',
      paper.status,
      paper.parse_status,
      paper.summary_status,
      paper.embedding_status,
      paper.category_status ?? '',
      paper.category_reason ?? '',
      String(paper.year ?? ''),
      ...(paper.tags ?? []),
    ]

    return searchableFields.some((field) => field.toLowerCase().includes(normalizedQuery))
  })
}

function buildStatsFromPapers(papers: Paper[]): StatsOverview {
  const total = papers.length
  const ready = papers.filter((paper) => paper.status === 'ready').length
  const parsed = papers.filter((paper) => paper.parse_status === 'completed').length
  const summarized = papers.filter((paper) => paper.summary_status === 'completed').length
  const pending = papers.filter((paper) => paper.status === 'queued').length
  const processing = papers.filter((paper) => paper.status === 'parsing' || paper.status === 'summarizing').length

  return {
    total,
    ready,
    parsed,
    summarized,
    pending,
    processing,
    completion_rate: total > 0 ? Math.round((ready / total) * 1000) / 10 : 0,
  }
}

function buildSourceDistribution(papers: Paper[]): SourceDistItem[] {
  const counts = new Map<string, number>()

  papers.forEach((paper) => {
    const source = paper.source?.trim() || 'unknown'
    counts.set(source, (counts.get(source) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
}

function buildDailyStats(papers: Paper[], days: number): DailyStatsItem[] {
  const dates = buildRecentDateKeys(days)
  const counts = new Map(dates.map((date) => [date, 0]))

  papers.forEach((paper) => {
    if (!paper.updated_at) return
    const date = toDateKey(paper.updated_at)
    if (!date || !counts.has(date)) return
    counts.set(date, (counts.get(date) ?? 0) + 1)
  })

  return dates.map((date) => ({ date, count: counts.get(date) ?? 0 }))
}

function buildRecentDateKeys(days: number): string[] {
  const result: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    result.push(formatDateKey(date))
  }

  return result
}

function toDateKey(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatDateKey(date)
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
