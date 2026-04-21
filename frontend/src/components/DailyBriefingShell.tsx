import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  fetchAutomationStatusToday,
  fetchBriefing,
  fetchBriefingHistory,
  runTodayBriefing,
} from '../lib/api'
import type {
  AutomationTodayStatus,
  DailyBriefingHistoryItem,
  DailyBriefingSnapshot,
  Paper,
} from '../types'
import { AutomationSettingsPanel } from './AutomationSettingsPanel'
import { BriefingHistoryPicker } from './BriefingHistoryPicker'
import { BriefingProjectsSidebar } from './BriefingProjectsSidebar'
import { BriefingTopPapers } from './BriefingTopPapers'
import { StatusBadge } from './StatusBadge'

function getAutomationStatusLabel(status: AutomationTodayStatus | null): string {
  if (!status) return 'waiting'
  if (!status.enabled || !status.briefing_enabled) return 'disabled'
  if (status.today_run?.status === 'failed') return 'failed'
  if (status.today_run?.status === 'running') return 'running'
  if (status.today_run?.status === 'completed') return 'completed'
  if (status.fallback_used) return 'fallback'
  return 'waiting'
}

export function DailyBriefingShell({
  papers,
  onOpenPaper,
}: {
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
}) {
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

  const serverToday = automationStatus?.local_today ?? clientToday
  const isTodaySelected = selectedDate === serverToday

  async function loadPage(targetDate: string, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const [statusData, historyData, briefingData] = await Promise.all([
        fetchAutomationStatusToday(),
        fetchBriefingHistory(),
        fetchBriefing(targetDate === (automationStatus?.local_today ?? clientToday) ? undefined : targetDate),
      ])
      setAutomationStatus(statusData)
      setHistory(historyData)
      setBriefing(briefingData)
    } catch (e) {
      setBriefing(null)
      setError(e instanceof Error ? e.message : '加载每日速览失败')
    } finally {
      if (silent) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await loadPage(selectedDate)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  async function pollTodayResult() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const statusData = await fetchAutomationStatusToday()
      setAutomationStatus(statusData)
      if (statusData.today_run?.status !== 'running') {
        const [historyData, briefingData] = await Promise.all([
          fetchBriefingHistory(),
          fetchBriefing(),
        ])
        setHistory(historyData)
        setBriefing(briefingData)
        return statusData
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return null
  }

  async function handleRunToday() {
    if (runningToday) return
    setRunningToday(true)
    setRunStatus('正在补跑...')
    try {
      const run = await runTodayBriefing()
      const polled = await pollTodayResult()
      if (polled?.today_run?.status === 'completed') {
        setRunStatus('补跑完成')
      } else if (polled?.today_run?.status === 'failed') {
        setRunStatus(polled.today_run.error_message || '补跑失败')
      } else {
        setRunStatus(`补跑已触发：${run.status}`)
        await loadPage(serverToday, { silent: true })
      }
    } catch (e) {
      setRunStatus(e instanceof Error ? e.message : '补跑失败')
    } finally {
      setRunningToday(false)
    }
  }

  const statusLabel = getAutomationStatusLabel(automationStatus)
  const runModeLabel = briefing?.trigger_type === 'manual' ? '手动补跑' : briefing?.trigger_type === 'scheduled' ? '自动生成' : ''

  if (loading) {
    return (
      <section className="panel-card briefing-shell">
        <div className="paper-detail-loading" style={{ minHeight: 200 }}>
          <div className="loading-spinner" />
          <span>正在加载每日速览...</span>
        </div>
      </section>
    )
  }

  if (error || !briefing) {
    return (
      <section className="panel-card briefing-shell">
        <div className="briefing-empty">{error || '暂无每日速览'}</div>
      </section>
    )
  }

  return (
    <section className="panel-card briefing-shell">
      <header className="panel-header">
        <div>
          <h2>每日速览</h2>
          <p>
            {briefing.briefing_date} · {new Date(briefing.generated_at).toLocaleString('zh-CN')}
            {runModeLabel ? ` · ${runModeLabel}` : ''}
          </p>
        </div>
        <div className="briefing-header-actions">
          <AutomationSettingsPanel />
          <button type="button" className="btn btn-primary" disabled={runningToday} onClick={() => void handleRunToday()}>
            {runningToday ? '补跑中' : '立即补跑今天日报'}
          </button>
          <BriefingHistoryPicker value={selectedDate} history={history} onChange={setSelectedDate} />
        </div>
      </header>

      <section className="briefing-status-card">
        <div className="briefing-status-card-top">
          <div className="briefing-status-title-group">
            <h3>今日自动化状态</h3>
            <p>{automationStatus?.local_today ?? briefing.briefing_date}</p>
          </div>
          <div className="briefing-status-badge-stack">
            <StatusBadge value={statusLabel} />
            {automationStatus?.today_run?.trigger_type ? <StatusBadge value={automationStatus.today_run.trigger_type} /> : null}
          </div>
        </div>
        <div className="briefing-status-meta">
          <span>计划时间 {automationStatus?.schedule_time ?? '--:--'}</span>
          <span>{automationStatus?.timezone ?? 'Asia/Shanghai'}</span>
          {automationStatus?.today_run?.completed_at ? (
            <span>最近完成 {new Date(automationStatus.today_run.completed_at).toLocaleString('zh-CN')}</span>
          ) : null}
        </div>
        {!automationStatus?.enabled || !automationStatus?.briefing_enabled ? (
          <div className="briefing-status-note">自动化已关闭</div>
        ) : null}
        {automationStatus?.fallback_used && automationStatus.fallback_briefing_date ? (
          <div className="briefing-status-note">当前展示 {automationStatus.fallback_briefing_date} 的回退日报</div>
        ) : null}
        {automationStatus?.today_run?.error_message ? (
          <div className="briefing-status-note error">{automationStatus.today_run.error_message}</div>
        ) : null}
      </section>

      {runStatus ? <div className="sync-indicator briefing-run-status">{runStatus}</div> : null}
      {refreshing ? <div className="sync-indicator briefing-run-status">正在刷新最新结果...</div> : null}

      <div className="briefing-grid">
        <article className="briefing-main">
          <div className="briefing-stats-row">
            <span>论文 {briefing.paper_count}</span>
            <span>项目 {briefing.project_count}</span>
            <span>来源 {briefing.source_count}</span>
            {briefing.trigger_type ? <span>{briefing.trigger_type === 'manual' ? '手动补跑' : '自动生成'}</span> : null}
            {briefing.fallback_used ? <span>回退内容</span> : null}
          </div>

          <div className="prose briefing-summary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {briefing.summary_markdown}
            </ReactMarkdown>
          </div>

          <BriefingTopPapers
            briefing={briefing}
            papers={papers}
            onOpenPaper={onOpenPaper}
          />
        </article>

        <div className="briefing-side-stack">
          <aside className="briefing-side">
            <div className="briefing-side-title">
              <h3>今日论文</h3>
              <span>{briefing.top_papers.length}</span>
            </div>
            <ol>
              {briefing.top_papers.map((item) => {
                const paper = item.paper_id === null ? undefined : papers.find(p => p.id === item.paper_id)
                return (
                  <li key={`${item.rank}-${item.paper_id ?? item.reason}`}>
                    <div className="briefing-paper-title">{paper?.title ?? `论文 ${item.paper_id ?? item.rank}`}</div>
                    <div className="briefing-paper-meta">
                      <span>{item.source_kind}</span>
                      <span>#{item.rank}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>
          <BriefingProjectsSidebar briefing={briefing} />
        </div>
      </div>
    </section>
  )
}
