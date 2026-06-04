import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import type { AutomationTodayStatus, DailyBriefingSnapshot, Paper } from '../types'

export const BRIEFING_POLL_ATTEMPTS = 300
export const BRIEFING_POLL_INTERVAL_MS = 2000

const OUTLINE_HEADING_MAX_LEVEL = 3

export type BriefingOutlineItem = {
  id: string
  label: string
  level: number
}

export type BriefingFeedbackMessage = {
  key: string
  text: string
  tone: 'info' | 'error'
}

export interface FriendlyIssue {
  title: string
  description: string
  category: 'rate_limit' | 'network' | 'not_found' | 'parse' | 'no_results' | 'other'
  severity: 'error' | 'warning'
  suggestion?: string
}

export function getAutomationStatusLabel(status: AutomationTodayStatus | null): string {
  if (!status) return 'waiting'
  if (!status.enabled || !status.briefing_enabled) return 'disabled'
  if (status.today_run?.status === 'failed') return 'failed'
  if (status.today_run?.status === 'running') return 'running'
  if (status.fallback_used && !status.today_briefing_exists) return 'fallback'
  if (status.today_run?.status === 'completed' || status.today_briefing_exists) return 'completed'
  return 'waiting'
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function isActiveRunStatus(status: string | null | undefined): boolean {
  const normalized = status?.toLowerCase() ?? ''
  return normalized === 'queued'
    || normalized === 'pending'
    || normalized === 'running'
    || normalized === 'processing'
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

export function normalizeLookupText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeLookupUrl(value: string | null | undefined): string {
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

export function addPaperLookupKey(lookup: Map<string, number>, key: string | null | undefined, paperId: number) {
  const textKey = normalizeLookupText(key)
  if (textKey) lookup.set(textKey, paperId)

  const urlKey = normalizeLookupUrl(key)
  if (urlKey && urlKey !== textKey) lookup.set(urlKey, paperId)
}

export function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return getNodeText(node.props.children)
  return ''
}

export function cleanMarkdownSummaryLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripOverviewSection(markdown: string): string {
  return markdown
    .replace(/^[-*]\s*\**(?:日期|订阅源|论文候选|论文配额|相关项目)\**[:：].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function getBriefingHighlights(
  markdown: string,
  fallbackPapers: DailyBriefingSnapshot['top_papers'],
): string[] {
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

export function getBriefingKeywords(briefing: DailyBriefingSnapshot, papers: Paper[]): string[] {
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

export function getBriefingGeneratedTime(value: string): string {
  let dateStr = value
  if (/T\d{2}:\d{2}/.test(dateStr) && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr += 'Z'
  }
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function getBriefingRiskLevel(riskCount: number): string {
  if (riskCount >= 4) return '高'
  if (riskCount > 0) return '中'
  return '低'
}

export function getBriefingReadingProgress(outlineItems: BriefingOutlineItem[], activeId: string): number {
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

export function getBriefingOutline(markdown: string): BriefingOutlineItem[] {
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

export function getHeadingId(label: string, level: number, outlineItems: BriefingOutlineItem[]): string | undefined {
  return outlineItems.find((item) => item.label === label && item.level === level)?.id
}

export function classifyIssueMessage(rawMessage: string): FriendlyIssue {
  const message = rawMessage || ''
  const lower = message.toLowerCase()

  if (message.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      title: 'API 访问过于频繁',
      description: '请求被源站限流，稍后将自动重试。',
      category: 'rate_limit',
      severity: 'warning',
      suggestion: '可以减少订阅源数量或降低拉取频率',
    }
  }

  if (lower.includes('read operation timed out') || lower.includes('timeout') || lower.includes('timed out')) {
    return {
      title: '连接超时',
      description: '源站响应过慢，未能在 30 秒内返回数据。',
      category: 'network',
      severity: 'warning',
      suggestion: '可能需要配置代理或稍后重试',
    }
  }

  if (lower.includes('expecting value') || lower.includes('json') || lower.includes('char 0')) {
    return {
      title: '数据格式异常',
      description: '源站返回了空响应或非 JSON 内容。',
      category: 'parse',
      severity: 'warning',
      suggestion: '可能是源站 API 变更或临时故障',
    }
  }

  if (lower.includes('rss feed parse failed') || lower.includes('xml') || lower.includes('parse')) {
    return {
      title: 'RSS 订阅解析失败',
      description: '该 RSS 源返回的内容无法解析为标准 XML。',
      category: 'parse',
      severity: 'warning',
      suggestion: '建议检查 RSS 地址是否仍然有效',
    }
  }

  if (message.includes('没有返回任何候选条目')) {
    return {
      title: '无新论文',
      description: '本次拉取没有找到新的候选论文。',
      category: 'no_results',
      severity: 'warning',
      suggestion: '可能源站暂无更新，或关键词太严格',
    }
  }

  if (message.includes('10061') || lower.includes('connection') || lower.includes('refused')) {
    return {
      title: '网络连接失败',
      description: '无法连接到源站，可能是代理未启动或网络问题。',
      category: 'network',
      severity: 'error',
      suggestion: '请在设置中检查代理配置',
    }
  }

  if (message.includes('404') || lower.includes('not found')) {
    return {
      title: '资源不存在',
      description: '源站返回 404，请确认订阅配置正确。',
      category: 'not_found',
      severity: 'error',
    }
  }

  if (message.match(/\b5\d{2}\b/)) {
    return {
      title: '源站服务异常',
      description: '源站暂时不可用（5xx 错误），稍后会自动重试。',
      category: 'network',
      severity: 'warning',
    }
  }

  const short = message.length > 100 ? message.slice(0, 100) + '...' : message
  return {
    title: '其他问题',
    description: short || '未知错误',
    category: 'other',
    severity: 'warning',
  }
}
