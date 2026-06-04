import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAutomationStatusToday, fetchBriefing, fetchBriefingHistory, runTodayBriefing } from '../lib/api'
import { Card, CardContent } from '@/components/ui/card'
import type { AutomationSettings, AutomationTodayStatus, DailyBriefingHistoryItem, DailyBriefingSnapshot, Paper } from '../types'
import { DailyBriefingHero } from './DailyBriefingHero'
import { DailyBriefingReport } from './DailyBriefingReport'
import { DailyBriefingSidebar } from './DailyBriefingSidebar'
import { addPaperLookupKey, BRIEFING_POLL_ATTEMPTS, BRIEFING_POLL_INTERVAL_MS, getAutomationStatusLabel, getBriefingGeneratedTime, getBriefingHighlights, getBriefingKeywords, getBriefingOutline, getBriefingReadingProgress, getBriefingRiskLevel, getErrorMessage, getNodeText, isActiveRunStatus, normalizeLookupText, normalizeLookupUrl, sleep } from './DailyBriefingShell.helpers'
import type { BriefingFeedbackMessage } from './DailyBriefingShell.helpers'
export function DailyBriefingShell({ papers, onOpenPaper }: {
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
}) {
  const navigate = useNavigate()
  const clientToday = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [selectedDate, setSelectedDate] = useState(clientToday)
  const [briefing, setBriefing] = useState<DailyBriefingSnapshot | null>(null)
  const [history, setHistory] = useState<DailyBriefingHistoryItem[]>([])
  const [automationStatus, setAutomationStatus] = useState<AutomationTodayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [runStatus, setRunStatus] = useState('')
  const [runningToday, setRunningToday] = useState(false)
  const [autoPolling, setAutoPolling] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [activeOutlineId, setActiveOutlineId] = useState('')
  const [isReviewed, setIsReviewed] = useState(false)

  const serverToday = automationStatus?.local_today ?? clientToday
  const isTodaySelected = selectedDate === serverToday
  const outlineItems = useMemo(() => getBriefingOutline(briefing?.summary_markdown ?? ''), [briefing?.summary_markdown])
  useEffect(() => {
    setActiveOutlineId('briefing-highlights')
  }, [briefing?.briefing_date, briefing?.daily_run_id])

  useEffect(() => {
    setIsReviewed(false)
  }, [briefing?.daily_run_id, briefing?.briefing_date])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

      if (visibleEntry?.target.id) setActiveOutlineId(visibleEntry.target.id)
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0.01 })
    for (const id of ['briefing-highlights', ...outlineItems.map(item => item.id)]) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [outlineItems])
  async function loadPage(targetDate: string, options?: { silent?: boolean; preserveCurrent?: boolean }) {
    const silent = options?.silent ?? false
    const preserveCurrent = options?.preserveCurrent ?? false
    silent ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const statusData = await fetchAutomationStatusToday()
      setAutomationStatus(statusData)

      if (statusData.today_run && isActiveRunStatus(statusData.today_run.status) && !runningToday && !autoPolling) {
        setAutoPolling(true)
        void pollActiveRun(statusData.today_run.id)
      }

      const [historyResult, briefingResult] = await Promise.allSettled([
        fetchBriefingHistory(),
        fetchBriefing(targetDate === statusData.local_today ? undefined : targetDate),
      ])

      if (historyResult.status === 'fulfilled') setHistory(historyResult.value)
      if (briefingResult.status === 'fulfilled') {
        setBriefing(briefingResult.value)
        return
      }
      throw briefingResult.reason
    } catch (e) {
      if (!preserveCurrent) setBriefing(null)
      setError(getErrorMessage(e, '加载每日速览失败'))
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!cancelled) await loadPage(selectedDate)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  async function pollTodayResult(expectedRunId: number | null) {
    for (let attempt = 0; attempt < BRIEFING_POLL_ATTEMPTS; attempt += 1) {
      const statusData = await fetchAutomationStatusToday()
      setAutomationStatus(statusData)
      const todayRun = statusData.today_run

      if (todayRun === null || (expectedRunId !== null && todayRun.id !== expectedRunId)) {
        await sleep(BRIEFING_POLL_INTERVAL_MS)
        continue
      }

      if (isActiveRunStatus(todayRun.status) && todayRun.progress_message) setRunStatus(todayRun.progress_message)

      if (!isActiveRunStatus(todayRun.status)) {
        try {
          const [historyData, briefingData] = await Promise.all([fetchBriefingHistory(), fetchBriefing()])
          setHistory(historyData)
          setBriefing(briefingData)
          setError('')
          return {
            statusData,
            briefingMatched: expectedRunId === null || briefingData.daily_run_id === expectedRunId,
          }
        } catch (refreshError) {
          setError(getErrorMessage(refreshError, '刷新每日速览失败'))
          return { statusData, briefingMatched: false }
        }
      }
      await sleep(BRIEFING_POLL_INTERVAL_MS)
    }
    return { statusData: null, briefingMatched: false }
  }

  async function pollActiveRun(expectedRunId: number | null) {
    const polled = await pollTodayResult(expectedRunId)
    setAutoPolling(false)
    if (polled.statusData?.today_run?.status === 'failed') {
      setRunStatus('自动运行失败: ' + (polled.statusData.today_run.error_message || '未知错误'))
    } else if (polled.briefingMatched) {
      setRunStatus('自动运行完成')
    } else {
      await loadPage(serverToday, { silent: true, preserveCurrent: true })
    }
  }

  async function handleRunToday() {
    if (runningToday) return
    setRunningToday(true)
    setRunStatus('正在补跑...')
    try {
      const run = await runTodayBriefing()
      const polled = await pollTodayResult(run.run_id)
      if (polled.statusData?.today_run?.status === 'failed') {
        setRunStatus(polled.statusData.today_run.error_message || '补跑失败')
      } else if (polled.statusData?.today_run?.status === 'completed' && polled.briefingMatched) {
        setRunStatus('补跑完成')
      } else {
        setRunStatus('补跑已完成，但最新日报尚未刷新到当前结果，请稍后再试')
        await loadPage(serverToday, { silent: true, preserveCurrent: true })
      }
    } catch (e) {
      setRunStatus(getErrorMessage(e, '补跑失败'))
    } finally {
      setRunningToday(false)
    }
  }

  async function handleSettingsSaved(_settings: AutomationSettings) {
    await loadPage(selectedDate, { silent: true, preserveCurrent: true })
  }

  function openPaperDetail(paperId: number) {
    if (onOpenPaper) {
      onOpenPaper(paperId)
      return
    }
    navigate(`/paper/${paperId}`)
  }

  const briefingPaperLinkLookup = useMemo(() => {
    const lookup = new Map<string, number>()
    for (const item of briefing?.top_papers ?? []) {
      if (item.paper_id === null) continue
      const paper = papers.find(p => p.id === item.paper_id)
      addPaperLookupKey(lookup, item.title, item.paper_id)
      addPaperLookupKey(lookup, item.canonical_url, item.paper_id)
      addPaperLookupKey(lookup, item.pdf_url, item.paper_id)
      addPaperLookupKey(lookup, paper?.title, item.paper_id)
      addPaperLookupKey(lookup, paper?.source, item.paper_id)
    }
    for (const paper of papers) {
      addPaperLookupKey(lookup, paper.title, paper.id)
      addPaperLookupKey(lookup, paper.source, paper.id)
    }
    return lookup
  }, [briefing?.top_papers, papers])

  function getBriefingPaperLinkId(href: string | undefined, children: ReactNode): number | null {
    for (const candidate of [normalizeLookupUrl(href), normalizeLookupText(href), normalizeLookupText(getNodeText(children))]) {
      const paperId = briefingPaperLinkLookup.get(candidate)
      if (paperId !== undefined) return paperId
    }
    return null
  }

  if (loading && !briefing) {
    return (
      <Card className="briefing-shell border-border/60 bg-card/80 dark:bg-card/50">
        <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-3">
          <div className="loading-spinner" />
          <span className="text-sm text-muted-foreground">正在加载每日速览...</span>
        </CardContent>
      </Card>
    )
  }

  if (!briefing) {
    return (
      <Card className="briefing-shell border-border/60 bg-card/80 dark:bg-card/50">
        <CardContent className="flex min-h-[200px] flex-col items-center justify-center">
          <div className="text-muted-foreground">{error || '暂无每日速览'}</div>
        </CardContent>
      </Card>
    )
  }

  const subscriptionIssues = automationStatus?.today_run?.subscription_issues ?? []
  const riskCount = subscriptionIssues.length + (briefing.failed_items?.length ?? 0) + (error ? 1 : 0)
  const outlineForDisplay = outlineItems.length > 0 ? outlineItems : [{ id: 'briefing-summary-content', label: '日报内容', level: 2 }]
  const feedbackMessages: BriefingFeedbackMessage[] = [
    ...(runStatus ? [{ key: 'run-status', text: runStatus, tone: runStatus.includes('失败') ? 'error' as const : 'info' as const }] : []),
    ...(refreshing ? [{ key: 'refreshing', text: '正在刷新最新结果...', tone: 'info' as const }] : []),
    ...(loading ? [{ key: 'loading', text: '正在加载所选日报...', tone: 'info' as const }] : []),
    ...(error ? [{ key: 'error', text: error, tone: 'error' as const }] : []),
  ]

  return (
    <section className="briefing-shell space-y-4">
      <DailyBriefingHero
        automationStatus={automationStatus}
        autoPolling={autoPolling}
        briefing={briefing}
        displayedBriefingDate={briefing.briefing_date ?? selectedDate}
        feedbackMessages={feedbackMessages}
        generatedAtTime={getBriefingGeneratedTime(briefing.generated_at)}
        history={history}
        isHistoryOpen={isHistoryOpen}
        isTodaySelected={isTodaySelected}
        loading={loading}
        onRunToday={() => void handleRunToday()}
        onSelectDate={(nextDate) => {
          setSelectedDate(nextDate)
          setIsHistoryOpen(false)
        }}
        onSettingsSaved={handleSettingsSaved}
        readingProgress={getBriefingReadingProgress(outlineForDisplay, activeOutlineId)}
        riskCount={riskCount}
        runModeLabel={briefing.trigger_type === 'manual' ? '手动补跑' : briefing.trigger_type === 'scheduled' ? '自动生成' : ''}
        runningToday={runningToday}
        selectedDate={selectedDate}
        setIsHistoryOpen={setIsHistoryOpen}
        statusLabel={getAutomationStatusLabel(automationStatus)}
      />

      <div className="briefing-grid">
        <DailyBriefingReport
          activeOutlineId={activeOutlineId}
          briefing={briefing}
          briefingHighlights={getBriefingHighlights(briefing.summary_markdown, briefing.top_papers)}
          getBriefingPaperLinkId={getBriefingPaperLinkId}
          isTodaySelected={isTodaySelected}
          keywordSummary={getBriefingKeywords(briefing, papers).join(' / ')}
          onOpenPaper={openPaperDetail}
          outlineForDisplay={outlineForDisplay}
          outlineItems={outlineItems}
          readOrderText={briefing.top_papers.length > 0 ? `先读 ${Math.min(3, briefing.top_papers.length)} 条关键建议，再处理风险` : '先浏览正文，再补充参考资料'}
          riskLevelLabel={getBriefingRiskLevel(riskCount)}
          setActiveOutlineId={setActiveOutlineId}
        />
        <DailyBriefingSidebar
          briefing={briefing}
          error={error}
          failedItems={briefing.failed_items ?? []}
          history={history}
          isReviewed={isReviewed}
          onOpenPaper={openPaperDetail}
          onPrint={() => window.print?.()}
          onShowHistory={() => setIsHistoryOpen(true)}
          onToggleReviewed={() => setIsReviewed(true)}
          papers={papers}
          referenceCount={briefing.projects.length}
          riskCount={riskCount}
          subscriptionIssues={subscriptionIssues}
        />
      </div>
    </section>
  )
}
