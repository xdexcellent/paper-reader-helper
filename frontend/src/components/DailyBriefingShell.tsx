import { isValidElement, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import {
  fetchAutomationStatusToday,
  fetchBriefing,
  fetchBriefingHistory,
  runTodayBriefing,
} from '../lib/api'
import type {
  AutomationSettings,
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
import { Icon } from './UiIcon'

const BRIEFING_POLL_ATTEMPTS = 60
const BRIEFING_POLL_INTERVAL_MS = 1500
const OUTLINE_HEADING_MAX_LEVEL = 3

type BriefingOutlineItem = {
  id: string
  label: string
  level: number
}

function getAutomationStatusLabel(status: AutomationTodayStatus | null): string {
  if (!status) return 'waiting'
  if (!status.enabled || !status.briefing_enabled) return 'disabled'
  if (status.today_run?.status === 'failed') return 'failed'
  if (status.today_run?.status === 'running') return 'running'
  if (status.fallback_used && !status.today_briefing_exists) return 'fallback'
  if (status.today_run?.status === 'completed' || status.today_briefing_exists) return 'completed'
  return 'waiting'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isActiveRunStatus(status: string | null | undefined): boolean {
  const normalized = status?.toLowerCase() ?? ''
  return normalized === 'queued'
    || normalized === 'pending'
    || normalized === 'running'
    || normalized === 'processing'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

function normalizeLookupText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeLookupUrl(value: string | null | undefined): string {
  const rawValue = (value ?? '').trim()
  if (!rawValue) return ''

  try {
    const url = new URL(rawValue, window.location.origin)
    url.hash = ''
    url.search = ''
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`.toLowerCase()
  } catch {
    return normalizeLookupText(rawValue.replace(/[?#].*$/, '').replace(/\/$/, ''))
  }
}

function addPaperLookupKey(lookup: Map<string, number>, key: string | null | undefined, paperId: number) {
  const textKey = normalizeLookupText(key)
  if (textKey) {
    lookup.set(textKey, paperId)
  }

  const urlKey = normalizeLookupUrl(key)
  if (urlKey && urlKey !== textKey) {
    lookup.set(urlKey, paperId)
  }
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return getNodeText(node.props.children)
  return ''
}

function cleanMarkdownSummaryLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Remove the "今日概览" stats list (日期/订阅源/论文候选/相关项目) from briefing markdown. */
function stripOverviewSection(markdown: string): string {
  // Remove bullet items that are stats — handles **bold** markers around keywords
  return markdown
    .replace(/^[-*]\s*\**(?:日期|订阅源|论文候选|论文配额|相关项目)\**[:：].*$/gm, '')
    // Clean up leftover empty lines
    .replace(/\n{3,}/g, '\n\n')
}

function getBriefingHighlights(markdown: string, fallbackPapers: DailyBriefingSnapshot['top_papers']): string[] {
  const lines = markdown
    .split('\n')
    .map(cleanMarkdownSummaryLine)
    .filter((line) => line.length >= 16 && !/^日期[:：]|^订阅源[:：]|^论文候选[:：]|^相关项目[:：]/.test(line))

  const preferred = lines.filter((line) => (
    /多模态|Agent|智能体|模型|医学|视觉|安全|评测|空间|生成|趋势|方向/.test(line)
  ))

  const picked = (preferred.length > 0 ? preferred : lines)
    .filter((line, index, list) => list.indexOf(line) === index)
    .slice(0, 3)

  if (picked.length > 0) return picked

  return fallbackPapers.slice(0, 3).map((item) => item.reason || item.title || `优先关注第 ${item.rank} 篇候选论文`)
}

function getBriefingKeywords(briefing: DailyBriefingSnapshot, papers: Paper[]): string[] {
  const candidates = briefing.top_papers.flatMap((item) => {
    const paper = item.paper_id === null ? undefined : papers.find(candidate => candidate.id === item.paper_id)
    return [
      paper?.tags?.[0],
      item.source_kind,
      item.title?.split(/[：:]/)[0],
    ]
  })

  const unique = candidates
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(value => value.trim())
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 3)

  return unique.length > 0 ? unique : ['今日速览']
}

function getBriefingGeneratedTime(value: string): string {
  // Backend stores UTC timestamps. Convert to local time for display.
  let dateStr = value
  // If the string has T but no timezone indicator, assume UTC
  if (/T\d{2}:\d{2}/.test(dateStr) && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += 'Z'
  }
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getBriefingRiskLevel(riskCount: number): string {
  if (riskCount >= 4) return '高'
  if (riskCount > 0) return '中'
  return '低'
}

function getBriefingReadingProgress(outlineItems: BriefingOutlineItem[], activeId: string): number {
  const ids = ['briefing-highlights', ...outlineItems.map(item => item.id), 'briefing-risks', 'briefing-references']
  if (ids.length <= 1) return 0

  const index = ids.indexOf(activeId)
  const normalizedIndex = index >= 0 ? index : 0
  return Math.round((normalizedIndex / (ids.length - 1)) * 100)
}

function slugifyHeading(label: string): string {
  const slug = label
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .replace(/\s+/g, '-')

  return slug || 'section'
}

function getBriefingOutline(markdown: string): BriefingOutlineItem[] {
  const usedIds = new Map<string, number>()

  return markdown
    .split('\n')
    .map((line) => {
      const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line)
      if (!match) return null

      const level = match[1].length
      if (level > OUTLINE_HEADING_MAX_LEVEL) return null

      const label = cleanMarkdownSummaryLine(match[2])
      const baseId = `briefing-section-${slugifyHeading(label)}`
      const count = usedIds.get(baseId) ?? 0
      usedIds.set(baseId, count + 1)

      return {
        id: count === 0 ? baseId : `${baseId}-${count + 1}`,
        label,
        level,
      }
    })
    .filter((item): item is BriefingOutlineItem => item !== null && item.label.length > 0)
}

function getHeadingId(label: string, level: number, outlineItems: BriefingOutlineItem[]): string | undefined {
  return outlineItems.find((item) => item.label === label && item.level === level)?.id
}

export function DailyBriefingShell({
  papers,
  onOpenPaper,
}: {
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

      if (visibleEntry?.target.id) {
        setActiveOutlineId(visibleEntry.target.id)
      }
    }, {
      rootMargin: '-18% 0px -68% 0px',
      threshold: 0.01,
    })

    const observedIds = ['briefing-highlights', ...outlineItems.map(item => item.id)]
    for (const id of observedIds) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [outlineItems])

  async function loadPage(targetDate: string, options?: { silent?: boolean; preserveCurrent?: boolean }) {
    const silent = options?.silent ?? false
    const preserveCurrent = options?.preserveCurrent ?? false
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const statusData = await fetchAutomationStatusToday()
      setAutomationStatus(statusData)

      // If an active run is detected and we're not already polling, start auto-polling
      if (statusData.today_run && isActiveRunStatus(statusData.today_run.status) && !runningToday && !autoPolling) {
        setAutoPolling(true)
        pollActiveRun(statusData.today_run.id)
      }

      const [historyResult, briefingResult] = await Promise.allSettled([
        fetchBriefingHistory(),
        fetchBriefing(targetDate === statusData.local_today ? undefined : targetDate),
      ])

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value)
      }
      if (briefingResult.status === 'fulfilled') {
        setBriefing(briefingResult.value)
        return
      }

      throw briefingResult.reason
    } catch (e) {
      if (!preserveCurrent) {
        setBriefing(null)
      }
      setError(getErrorMessage(e, '加载每日速览失败'))
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

  async function pollTodayResult(expectedRunId: number | null) {
    for (let attempt = 0; attempt < BRIEFING_POLL_ATTEMPTS; attempt += 1) {
      const statusData = await fetchAutomationStatusToday()
      setAutomationStatus(statusData)

      const todayRun = statusData.today_run
      if (todayRun === null || (expectedRunId !== null && todayRun.id !== expectedRunId)) {
        await sleep(BRIEFING_POLL_INTERVAL_MS)
        continue
      }

      if (isActiveRunStatus(todayRun.status) && todayRun.progress_message) {
        setRunStatus(todayRun.progress_message)
      }

      if (!isActiveRunStatus(todayRun.status)) {
        try {
          const [historyData, briefingData] = await Promise.all([
            fetchBriefingHistory(),
            fetchBriefing(),
          ])
          setHistory(historyData)
          setBriefing(briefingData)
          setError('')
          return {
            statusData,
            briefingMatched: expectedRunId === null || briefingData.daily_run_id === expectedRunId,
          }
        } catch (error) {
          setError(getErrorMessage(error, '刷新每日速览失败'))
          return {
            statusData,
            briefingMatched: false,
          }
        }
      }

      await sleep(BRIEFING_POLL_INTERVAL_MS)
    }
    return {
      statusData: null,
      briefingMatched: false,
    }
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

  const statusLabel = getAutomationStatusLabel(automationStatus)
  const runModeLabel = briefing?.trigger_type === 'manual' ? '手动补跑' : briefing?.trigger_type === 'scheduled' ? '自动生成' : ''
  const displayedBriefingDate = briefing?.briefing_date ?? selectedDate
  const feedbackMessages: Array<{ key: string; text: string; tone: 'info' | 'error' }> = []
  if (runStatus) {
    feedbackMessages.push({
      key: 'run-status',
      text: runStatus,
      tone: runStatus.includes('失败') ? 'error' : 'info',
    })
  }
  if (refreshing) {
    feedbackMessages.push({ key: 'refreshing', text: '正在刷新最新结果...', tone: 'info' })
  }
  if (loading) {
    feedbackMessages.push({ key: 'loading', text: '正在加载所选日报...', tone: 'info' })
  }
  if (error) {
    feedbackMessages.push({ key: 'error', text: error, tone: 'error' })
  }
  const subscriptionIssues = automationStatus?.today_run?.subscription_issues ?? []
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
    const candidates = [
      normalizeLookupUrl(href),
      normalizeLookupText(href),
      normalizeLookupText(getNodeText(children)),
    ]

    for (const candidate of candidates) {
      const paperId = briefingPaperLinkLookup.get(candidate)
      if (paperId !== undefined) return paperId
    }

    return null
  }

  if (loading && !briefing) {
    return (
      <section className="panel-card briefing-shell">
        <div className="paper-detail-loading" style={{ minHeight: 200 }}>
          <div className="loading-spinner" />
          <span>正在加载每日速览...</span>
        </div>
      </section>
    )
  }

  if (!briefing) {
    return (
      <section className="panel-card briefing-shell">
        <div className="briefing-empty">{error || '暂无每日速览'}</div>
      </section>
    )
  }

  const automationProgress = automationStatus?.today_run?.progress
  const briefingHighlights = getBriefingHighlights(briefing.summary_markdown, briefing.top_papers)
  const riskCount = subscriptionIssues.length + (briefing.failed_items?.length ?? 0) + (error ? 1 : 0)
  const referenceCount = briefing.projects.length
  const outlineForDisplay = outlineItems.length > 0
    ? outlineItems
    : [{ id: 'briefing-summary-content', label: '日报内容', level: 2 }]
  const generatedAtTime = getBriefingGeneratedTime(briefing.generated_at)
  const keywordSummary = getBriefingKeywords(briefing, papers).join(' / ')
  const riskLevelLabel = getBriefingRiskLevel(riskCount)
  const readingProgress = getBriefingReadingProgress(outlineForDisplay, activeOutlineId)
  const readOrderText = briefing.top_papers.length > 0
    ? `先读 ${Math.min(3, briefing.top_papers.length)} 条关键建议，再处理风险`
    : '先浏览正文，再补充参考资料'

  function handlePrintReport() {
    window.print?.()
  }

  return (
    <section className="panel-card briefing-shell">
      <header className="briefing-command-deck briefing-hero">
        <div className="briefing-hero-bar">
          <span className="briefing-command-kicker">工作看板</span>
          <div className="briefing-hero-status" aria-label="工作看板状态">
            <StatusBadge value={statusLabel} />
            {!isTodaySelected ? <span className="briefing-command-status-pill">历史日报</span> : null}
            <span className="briefing-command-status-pill">{automationStatus?.timezone ?? 'Asia/Shanghai'}</span>
            {briefing.trigger_type ? <StatusBadge value={briefing.trigger_type} /> : null}
          </div>
        </div>

        <div className="briefing-hero-title-row">
          <div className="briefing-hero-title-block">
            <h2>今日工作概览</h2>
            <p className="briefing-hero-purpose">聚合今日论文、项目、风险与关键信号，用于快速判断处理优先级。</p>
          </div>
          <div className="briefing-hero-actions">
            <label className="briefing-hero-search">
              <Icon name="search" />
              <input aria-label="搜索论文、项目或关键词" placeholder="搜索论文、项目或关键词" />
            </label>
            <button
              type="button"
              className="briefing-hero-rerun-button"
              aria-label="生成报告"
              disabled={runningToday}
              onClick={() => void handleRunToday()}
            >
              <Icon name="refresh" />
              {runningToday ? '生成中' : '生成报告'}
            </button>
          </div>
        </div>

        <div className="briefing-hero-status-bar">
          <span>{displayedBriefingDate}</span>
          <span>最后生成 {generatedAtTime}</span>
          <span>阅读进度 {readingProgress}%</span>
          {runModeLabel ? <span>{runModeLabel}</span> : null}
        </div>

        <div className="briefing-hero-stat-tags">
          <span>论文候选 <strong>{briefing.paper_count}</strong></span>
          <span>相关项目 <strong>{briefing.project_count}</strong></span>
          <span>订阅源 <strong>{briefing.source_count}</strong></span>
          <span>风险热点 <strong>{riskCount}</strong></span>
        </div>

        <div className="briefing-hero-auto-bar">
          <span>自动生成：每天 {automationStatus?.schedule_time ?? '12:00'} · {automationStatus?.timezone ?? 'Asia/Shanghai'}</span>
          {automationStatus?.today_run?.completed_at ? (
            <span>最近完成 {(() => {
              let s = automationStatus.today_run.completed_at
              if (/T\d{2}:\d{2}/.test(s) && !s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z'
              return new Date(s).toLocaleString('zh-CN')
            })()}</span>
          ) : null}
          <AutomationSettingsPanel onSaved={handleSettingsSaved} buttonClassName="briefing-auto-settings-btn" buttonLabel="自动化设置" />
        </div>

        {feedbackMessages.length > 0 ? (
          <div className="briefing-command-feedback-row">
            {feedbackMessages.map((message) => (
              <div
                key={message.key}
                className={`sync-indicator briefing-command-feedback${message.tone === 'error' ? ' error' : ''}`}
              >
                {message.text}
              </div>
            ))}
          </div>
        ) : null}

        {history.length > 0 && isHistoryOpen ? (
          <section className={`briefing-history-panel${isHistoryOpen ? ' open' : ''}`}>
            <div className="briefing-history-panel-body">
              <BriefingHistoryPicker
                value={selectedDate}
                history={history}
                onChange={(nextDate) => {
                  setSelectedDate(nextDate)
                  setIsHistoryOpen(false)
                }}
              />
            </div>
          </section>
        ) : null}

        {subscriptionIssues.length > 0 ? (
          <div className="briefing-subscription-issues" aria-label="订阅源问题反馈">
            <strong>订阅源问题反馈</strong>
            <ul>
              {subscriptionIssues.map((issue, index) => (
                <li
                  key={`${issue.subscription_id ?? index}-${issue.subscription_name}`}
                  className={issue.severity === 'error' ? 'error' : 'warning'}
                >
                  <span>{issue.subscription_name || issue.source_kind || '未知订阅源'}</span>
                  <small>{issue.message}</small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {(runningToday || autoPolling) && automationStatus?.today_run && isActiveRunStatus(automationStatus.today_run.status) ? (
          <div className="briefing-progress">
            <div className="briefing-progress-meta">
              <span>{automationStatus.today_run.progress_message || '处理中...'}</span>
              <span>{automationStatus.today_run.progress}%</span>
            </div>
            <div className="briefing-progress-track">
              <div
                className="briefing-progress-fill"
                style={{ width: `${automationProgress ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {!automationStatus?.enabled || !automationStatus?.briefing_enabled ? (
          <div className="briefing-status-note">自动化已关闭</div>
        ) : null}
        {automationStatus?.fallback_used && automationStatus.fallback_briefing_date ? (
          <div className="briefing-status-note">
            今日 {automationStatus.local_today} 暂无成功日报，当前展示 {automationStatus.fallback_briefing_date} 的回退日报
          </div>
        ) : null}
        {!automationStatus?.today_briefing_exists && !automationStatus?.fallback_used && automationStatus?.enabled && automationStatus?.briefing_enabled ? (
          <div className="briefing-status-note">今日 {automationStatus.local_today} 还没有可展示的日报</div>
        ) : null}
        {automationStatus?.today_run?.error_message ? (
          <div className="briefing-status-note error">{automationStatus.today_run.error_message}</div>
        ) : null}
      </header>

      <div className="briefing-grid">
        <article className="briefing-main">
          <div className="briefing-main-layout">
            <nav className="briefing-document-outline" aria-label="文档目录">
              <div className="briefing-outline-title">文档目录</div>
              <a
                href="#briefing-highlights"
                className={activeOutlineId === 'briefing-highlights' ? 'active' : ''}
                title="今日重点"
                onClick={() => setActiveOutlineId('briefing-highlights')}
              >
                今日重点
              </a>
              {outlineForDisplay.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`${activeOutlineId === item.id ? 'active' : ''} level-${item.level}`}
                  title={item.label}
                  onClick={() => setActiveOutlineId(item.id)}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="briefing-report-column">
              <section id="briefing-highlights" className="briefing-highlight-panel" aria-label="今日重点">
                <div className="briefing-highlight-head">
                  <span>今日重点</span>
                  <h3>先看这三条结论</h3>
                  <a href="#briefing-recommendations">查看关键建议</a>
                </div>
                <div className="briefing-highlight-body">
                  <ol>
                    {briefingHighlights.map((item, index) => (
                      <li key={`${index}-${item}`}>
                        <span>{index + 1}</span>
                        <div>
                          <p>{item}</p>
                          <a href={index === 0 ? '#briefing-recommendations' : '#briefing-summary-content'}>
                            {index === 0 ? '查看相关论文' : '跳到正文'}
                          </a>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <dl className="briefing-highlight-summary" aria-label="今日摘要">
                    <div>
                      <dt>今日关键词</dt>
                      <dd>{keywordSummary}</dd>
                    </div>
                    <div>
                      <dt>风险等级</dt>
                      <dd>{riskLevelLabel}</dd>
                    </div>
                    <div>
                      <dt>推荐阅读顺序</dt>
                      <dd>{readOrderText}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <header id="briefing-summary-content" className="briefing-main-header">
                <span>日报内容</span>
                <h3>今日论文汇总</h3>
                <p>以下内容来自今日速览正文，保留原始分组和论文链接。</p>
              </header>

              <div className="briefing-stats-row">
                <span>论文候选 {briefing.paper_count}</span>
                <span>项目 {briefing.project_count}</span>
                <span>订阅源 {briefing.source_count}</span>
                {briefing.trigger_type ? <span>{briefing.trigger_type === 'manual' ? '手动补跑' : '自动生成'}</span> : null}
                {briefing.fallback_used ? <span>回退内容</span> : null}
                {!isTodaySelected ? <span>历史日报</span> : null}
              </div>

              <div className="prose briefing-summary">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a({ href, children }) {
                      const paperId = getBriefingPaperLinkId(href, children)
                      if (paperId !== null) {
                        return (
                          <a
                            href={`/paper/${paperId}`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              openPaperDetail(paperId)
                            }}
                          >
                            {children}
                          </a>
                        )
                      }
                      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
                    },
                    h1({ children }) {
                      const label = cleanMarkdownSummaryLine(getNodeText(children))
                      return <h1 id={getHeadingId(label, 1, outlineItems)}>{children}</h1>
                    },
                    h2({ children }) {
                      const label = cleanMarkdownSummaryLine(getNodeText(children))
                      return <h2 id={getHeadingId(label, 2, outlineItems)}>{children}</h2>
                    },
                    h3({ children }) {
                      const label = cleanMarkdownSummaryLine(getNodeText(children))
                      return <h3 id={getHeadingId(label, 3, outlineItems)}>{children}</h3>
                    },
                  }}
                >
                  {stripOverviewSection(briefing.summary_markdown)}
                </ReactMarkdown>
              </div>

              {briefing.failed_items && briefing.failed_items.length > 0 ? (
                <details className="briefing-failed-section">
                  <summary>
                    <strong>失败论文 {briefing.failed_items.length} 篇</strong>
                    <span>展开查看每篇失败原因</span>
                  </summary>
                  <ul className="briefing-failed-list">
                    {briefing.failed_items.map((item, index) => (
                      <li key={`${index}-${item.title}`}>
                        <div className="briefing-failed-title">
                          {item.canonical_url ? (
                            <a href={item.canonical_url} target="_blank" rel="noreferrer">{item.title}</a>
                          ) : (
                            <span>{item.title}</span>
                          )}
                          <span className="briefing-failed-source">{item.source_kind}</span>
                        </div>
                        <div className="briefing-failed-reason">{item.reason}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </div>
        </article>

        <div className="briefing-side-stack">
          <aside id="briefing-recommendations" className="briefing-side briefing-paper-ranking-panel">
            <div className="briefing-side-title">
              <h3>关键建议</h3>
              <span>{briefing.top_papers.length}</span>
            </div>
            <BriefingTopPapers
              briefing={briefing}
              papers={papers}
              onOpenPaper={onOpenPaper}
            />
          </aside>

          <aside id="briefing-risks" className="briefing-side briefing-risk-panel">
            <div className="briefing-side-title">
              <h3>风险点</h3>
              <span>{riskCount}</span>
            </div>
            {riskCount > 0 ? (
              <ul className="briefing-risk-list">
                {error ? (
                  <li className="error">
                    <strong>加载异常</strong>
                    <p>{error}</p>
                  </li>
                ) : null}
                {subscriptionIssues.map((issue, index) => (
                  <li
                    key={`${issue.subscription_id ?? index}-${issue.subscription_name}`}
                    className={issue.severity === 'error' ? 'error' : 'warning'}
                  >
                    <strong>{issue.subscription_name || issue.source_kind || '未知订阅源'}</strong>
                    <p>{issue.message}</p>
                  </li>
                ))}
                {briefing.failed_items?.map((item, index) => (
                  <li key={`${index}-${item.title}`} className="error">
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="briefing-side-empty">暂无阻断风险，继续按关键建议阅读即可。</p>
            )}
          </aside>

          <aside id="briefing-references" className="briefing-side briefing-reference-panel">
            <div className="briefing-side-title">
              <h3>参考资料</h3>
              <span>{referenceCount}</span>
            </div>
            {briefing.projects.length > 0 ? (
              <BriefingProjectsSidebar briefing={briefing} />
            ) : (
              <p className="briefing-side-empty">今天没有延伸项目。</p>
            )}
          </aside>

          <aside className="briefing-side briefing-history-card">
            <div className="briefing-side-title">
              <h3>历史记录</h3>
              <span>{history.length}</span>
            </div>
            <p>{history.length > 0 ? `最近一条：${history[0].briefing_date}` : '暂无历史日报。'}</p>
            {history.length > 0 ? (
              <button
                type="button"
                className="briefing-side-action"
                onClick={() => setIsHistoryOpen(true)}
              >
                查看历史日报
              </button>
            ) : null}
          </aside>

          <aside className="briefing-side briefing-next-steps">
            <div className="briefing-side-title">
              <h3>下一步建议</h3>
              <span>3</span>
            </div>
            <button
              type="button"
              className="briefing-side-action primary"
              onClick={() => setIsReviewed(true)}
            >
              {isReviewed ? '已审阅' : '标记为已审阅'}
            </button>
            <a className="briefing-side-action" href="#briefing-summary-content">生成摘要</a>
            <button type="button" className="briefing-side-action" onClick={handlePrintReport}>一键导出</button>
          </aside>
        </div>
      </div>
    </section>
  )
}
