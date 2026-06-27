import type { DailyStatsItem } from '../../lib/api'
import type { DailyBriefingSnapshot, Paper } from '../../types'
import type { MockPaper, MockProgress, NavigationItemData } from './mockData'

/**
 * Filter type for the paper summary section.
 * "全部" = all papers, "未读" = unread, "已读" = read
 */
export type PaperFilter = '全部' | '未读' | '已读'

/**
 * Filters papers by read status based on the selected filter.
 * - "全部" returns all papers (length equals input length)
 * - "未读" returns only papers with isRead === false
 * - "已读" returns only papers with isRead === true
 */
export function filterPapers(papers: MockPaper[], filter: PaperFilter): MockPaper[] {
  switch (filter) {
    case '全部':
      return papers
    case '未读':
      return papers.filter((paper) => !paper.isRead)
    case '已读':
      return papers.filter((paper) => paper.isRead)
  }
}

/**
 * Truncates text to a maximum length, appending "…" if truncated.
 * - If input length <= maxLength, output === input
 * - If input length > maxLength, output ends with "…" and length === maxLength + 1
 * - Output never exceeds maxLength + 1 characters
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '…'
}

/**
 * Computes the reading progress percentage, rounded to the nearest integer.
 * - Returns Math.round((readCount / totalTarget) * 100)
 * - Result is clamped to [0, 100]
 * - Guards against division by zero (returns 0 if totalTarget <= 0)
 */
export function computePercentage(readCount: number, totalTarget: number): number {
  if (totalTarget <= 0) {
    return 0
  }
  const raw = Math.round((readCount / totalTarget) * 100)
  return Math.max(0, Math.min(100, raw))
}

/**
 * Validates that a MockPaper object satisfies all data invariants:
 * - relevanceScore in [0.0, 1.0]
 * - citations >= 0
 * - tags length between 1 and 5
 * - date is a valid ISO 8601 date string
 * - id is a non-empty string
 */
export function validateMockPaper(paper: MockPaper): boolean {
  if (typeof paper.id !== 'string' || paper.id.length === 0) {
    return false
  }
  if (paper.relevanceScore < 0 || paper.relevanceScore > 1) {
    return false
  }
  if (paper.citations < 0 || !Number.isInteger(paper.citations)) {
    return false
  }
  if (!Array.isArray(paper.tags) || paper.tags.length < 1 || paper.tags.length > 5) {
    return false
  }
  // Validate ISO 8601 date
  const dateObj = new Date(paper.date)
  if (isNaN(dateObj.getTime())) {
    return false
  }
  return true
}

/**
 * Validates that a MockProgress object satisfies all data invariants:
 * - totalTarget >= readCount + pendingCount
 * - percentage in [0, 100]
 * - weeklyData length === 7
 * - All weeklyData elements >= 0
 * - estimatedCompletion matches HH:MM pattern (24-hour format)
 */
export function validateMockProgress(progress: MockProgress): boolean {
  if (progress.totalTarget < progress.readCount + progress.pendingCount) {
    return false
  }
  if (progress.percentage < 0 || progress.percentage > 100) {
    return false
  }
  if (!Array.isArray(progress.weeklyData) || progress.weeklyData.length !== 7) {
    return false
  }
  if (progress.weeklyData.some((val) => val < 0)) {
    return false
  }
  // Validate HH:MM format (24-hour)
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!timePattern.test(progress.estimatedCompletion)) {
    return false
  }
  return true
}

type DashboardNavigationContext = {
  papers: Paper[]
  briefing?: DailyBriefingSnapshot | null
  riskCount?: number
}

export function buildRecentDateKeys(days: number, now = new Date()): string[] {
  const safeDays = Math.max(1, Math.floor(days))
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (safeDays - 1 - index))
    return formatDateKey(date)
  })
}

export function buildWeeklyData(
  papers: Paper[],
  dailyStats: DailyStatsItem[] = [],
  now = new Date(),
): number[] {
  const dates = buildRecentDateKeys(7, now)
  const counts = new Map(dates.map((date) => [date, 0]))

  for (const item of dailyStats) {
    if (counts.has(item.date)) {
      counts.set(item.date, Math.max(0, item.count))
    }
  }

  if (dailyStats.length === 0) {
    for (const paper of papers) {
      if (!paper.updated_at) continue
      const date = toDateKey(paper.updated_at)
      if (!date || !counts.has(date)) continue
      counts.set(date, (counts.get(date) ?? 0) + 1)
    }
  }

  return dates.map((date) => counts.get(date) ?? 0)
}

export function estimateCompletionLabel(
  pendingCount: number,
  minutesPerPaper: number,
  now = new Date(),
): string {
  if (pendingCount <= 0) return '已完成'

  const safeMinutesPerPaper = Math.max(5, Math.min(180, Math.round(minutesPerPaper) || 20))
  const completion = new Date(now.getTime() + pendingCount * safeMinutesPerPaper * 60_000)
  const timeLabel = formatTimeLabel(completion)

  if (formatDateKey(completion) === formatDateKey(now)) {
    return timeLabel
  }

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (formatDateKey(completion) === formatDateKey(tomorrow)) {
    return `明日 ${timeLabel}`
  }

  return `${completion.getMonth() + 1}/${completion.getDate()} ${timeLabel}`
}

export function buildResearchProgress(papers: Paper[]): { percentage: number; readCount: number; totalCount: number } {
  const totalCount = papers.length
  const readCount = papers.filter((paper) => getPaperReadStatus(paper)).length
  return {
    percentage: computePercentage(readCount, totalCount),
    readCount,
    totalCount,
  }
}

export function buildDashboardNavigationItems({
  papers,
  briefing = null,
  riskCount = 0,
}: DashboardNavigationContext): NavigationItemData[] {
  const readCount = papers.filter((paper) => getPaperReadStatus(paper)).length
  const unreadCount = Math.max(0, papers.length - readCount)
  const processingCount = papers.filter((paper) => (
    paper.status === 'parsing'
    || paper.status === 'summarizing'
    || paper.parse_status === 'processing'
    || paper.summary_status === 'processing'
    || paper.embedding_status === 'processing'
  )).length
  const sourceCount = briefing?.source_count ?? 0
  const candidateCount = briefing?.paper_count ?? papers.length
  const projectCount = briefing?.project_count ?? 0

  return [
    {
      id: 'nav-new-subscription',
      label: '订阅管理',
      subtitle: sourceCount > 0 ? `${sourceCount} 个订阅源` : '管理订阅源',
      icon: 'Plus',
      path: '/subscribe',
      isActive: false,
      highlight: true,
    },
    {
      id: 'nav-dashboard',
      label: '工作看板',
      subtitle: candidateCount > 0 ? `今日 ${candidateCount} 篇候选` : '今日工作概览',
      icon: 'LayoutDashboard',
      path: '/dashboard',
      isActive: false,
    },
    {
      id: 'nav-ai-assistant',
      label: 'AI 研究助手',
      subtitle: unreadCount > 0 ? `${unreadCount} 篇待读` : '智能问答与分析',
      icon: 'Bot',
      path: '/assistant',
      isActive: false,
    },
    {
      id: 'nav-academic-tracking',
      label: '学术追踪',
      subtitle: `${readCount}/${papers.length || 0} 篇已读`,
      icon: 'Radar',
      path: '/stats',
      isActive: false,
    },
    {
      id: 'nav-paper-management',
      label: '论文管理',
      subtitle: papers.length > 0 ? `${papers.length} 篇文献` : '文献库管理',
      icon: 'FolderOpen',
      path: '/',
      isActive: false,
    },
    {
      id: 'nav-ai-recommendation',
      label: 'AI 智能推荐',
      subtitle: projectCount > 0 ? `${projectCount} 个相关项目` : '个性化推荐',
      icon: 'Sparkles',
      path: '/recommendation',
      isActive: false,
    },
    {
      id: 'nav-library-agent',
      label: '文库 Agent',
      subtitle: processingCount > 0 ? `${processingCount} 项处理中` : '自动化文献处理',
      icon: 'Library',
      path: '/agent',
      isActive: false,
    },
    {
      id: 'nav-zotero-import',
      label: 'Zotero 导入',
      subtitle: riskCount > 0 ? `${riskCount} 个待关注项` : '同步 Zotero 文献',
      icon: 'Download',
      path: '/zotero/import',
      isActive: false,
    },
  ]
}

// ─── Relevance Score Normalization ──────────────────────────────────

/**
 * Normalizes a raw relevance/priority score to a 0-1 range.
 * Handles three cases:
 * - Already in [0, 1]: return as-is (e.g., 0.96)
 * - In (1, 100]: treat as percentage, divide by 100 (e.g., 96 → 0.96)
 * - Greater than 100: normalize to [0, 1] using a sigmoid-like mapping
 *   (caps at 1.0 for display purposes)
 *
 * Returns a number in [0, 1].
 */
export function normalizeRelevanceScore(rawScore: number | null | undefined): number {
  if (rawScore == null || isNaN(rawScore)) return 0
  if (rawScore < 0) return 0
  if (rawScore <= 1) return rawScore           // Already 0-1
  if (rawScore <= 100) return rawScore / 100   // Percentage 0-100
  // Raw priority score > 100: normalize using diminishing returns
  // Map to 0-1 range where 200 → ~0.95, 500 → ~0.99
  return Math.min(1, 1 - 1 / (1 + rawScore / 100))
}

/**
 * Formats a relevance score for display as a percentage string.
 * Accepts raw scores in any range and normalizes them first.
 * Returns e.g. "96%" or "0%" for invalid/missing scores.
 */
export function safeFormatPercent(rawScore: number | null | undefined): string {
  const normalized = normalizeRelevanceScore(rawScore)
  return `${Math.round(normalized * 100)}%`
}

// ─── Paper Read Status Detection ────────────────────────────────────

const READ_STATUSES = new Set([
  'read', '已读', 'completed', 'done', 'finished',
])

const UNREAD_STATUSES = new Set([
  'unread', '未读', 'pending', 'new', 'todo',
])

/**
 * Determines whether a paper should be considered "read" based on
 * multiple possible status fields and fallback heuristics.
 *
 * Compatible with:
 * - reading_status: 'read' | 'unread' | 'reading' | 'skipped' | etc.
 * - Chinese status strings: '已读', '未读'
 * - Alternative statuses: 'completed', 'done', 'finished', 'pending', 'new', 'todo'
 * - Fallback fields: reading_progress >= 100, or presence of read_at
 */
export function getPaperReadStatus(paper: {
  reading_status?: string | null
  reading_progress?: number | null
  status?: string | null
  read_at?: string | null
  opened_at?: string | null
}): boolean {
  // 1. Check reading_status field
  const rs = (paper.reading_status ?? '').toLowerCase().trim()
  if (READ_STATUSES.has(rs)) return true
  if (UNREAD_STATUSES.has(rs)) return false

  // 2. Check reading_progress
  if (typeof paper.reading_progress === 'number' && paper.reading_progress >= 100) {
    return true
  }

  // 3. Check read_at timestamp
  if (paper.read_at) return true

  // 4. Check generic status field
  const status = (paper.status ?? '').toLowerCase().trim()
  if (READ_STATUSES.has(status)) return true

  // 5. Default: unread
  return false
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

function formatTimeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
