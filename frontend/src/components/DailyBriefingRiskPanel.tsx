import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AutomationSubscriptionIssue, BriefingFailedItem } from '../types'
import { isFailedItemRescueEligible, spisStatusLabel } from '../lib/spisRescue'
import { classifyIssueMessage } from './DailyBriefingShell.helpers'
import type { FriendlyIssue } from './DailyBriefingShell.helpers'
import { Icon } from './UiIcon'
import type { IconName } from './UiIcon'

interface RiskPanelBodyProps {
  error: string
  subscriptionIssues: AutomationSubscriptionIssue[]
  failedItems: BriefingFailedItem[]
  onSpisRescue?: (item: BriefingFailedItem) => void | Promise<void>
  rescuingPaperId?: number | null
}

interface GroupedIssue {
  key: string
  friendly: FriendlyIssue
  sources: Array<{ name: string; sourceKind: string }>
}

function getIssueCategoryIcon(category: FriendlyIssue['category']): IconName {
  const map: Record<FriendlyIssue['category'], IconName> = {
    rate_limit: 'refresh',
    network: 'rss',
    not_found: 'search',
    parse: 'fileText',
    no_results: 'file',
    other: 'warning',
  }
  return map[category]
}

export function DailyBriefingRiskPanel({
  error,
  subscriptionIssues,
  failedItems,
  onSpisRescue,
  rescuingPaperId = null,
}: RiskPanelBodyProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const groupedSubIssues = useMemo<GroupedIssue[]>(() => {
    const groups = new Map<string, GroupedIssue>()
    for (const issue of subscriptionIssues) {
      const friendly = classifyIssueMessage(issue.message || '')
      const key = `${friendly.category}-${friendly.severity}`
      const source = {
        name: issue.subscription_name || issue.source_kind || '未知订阅源',
        sourceKind: issue.source_kind || '',
      }
      const existing = groups.get(key)
      if (existing) {
        existing.sources.push(source)
      } else {
        groups.set(key, { key, friendly, sources: [source] })
      }
    }
    return [...groups.values()].sort((a, b) => {
      if (a.friendly.severity !== b.friendly.severity) {
        return a.friendly.severity === 'error' ? -1 : 1
      }
      return b.sources.length - a.sources.length
    })
  }, [subscriptionIssues])

  function toggle(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <ul className="briefing-risk-list">
      {error ? (
        <li className="error">
          <div className="risk-item-header">
            <Icon name="warning" className="risk-icon" />
            <strong>加载异常</strong>
          </div>
          <p>{error}</p>
        </li>
      ) : null}

      {groupedSubIssues.map((group) => {
        const isExpanded = expandedKeys.has(group.key)
        return (
          <li
            key={group.key}
            className={group.friendly.severity === 'error' ? 'error' : 'warning'}
          >
            <div className="risk-item-header">
              <Icon name={getIssueCategoryIcon(group.friendly.category)} className="risk-icon" />
              <strong>{group.friendly.title}</strong>
              {group.sources.length > 1 ? (
                <Badge variant="outline" className="risk-count-badge">x{group.sources.length}</Badge>
              ) : null}
            </div>
            <p className="risk-description">{group.friendly.description}</p>
            {group.friendly.suggestion ? (
              <p className="risk-suggestion">{group.friendly.suggestion}</p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="risk-toggle-sources"
              onClick={() => toggle(group.key)}
            >
              {isExpanded ? '收起' : `查看受影响的 ${group.sources.length} 个订阅源`}
            </Button>
            {isExpanded ? (
              <ul className="risk-source-list">
                {group.sources.map((src, index) => (
                  <li key={`${src.name}-${index}`}>
                    <span className="risk-source-name">{src.name}</span>
                    {src.sourceKind ? (
                      <span className="risk-source-kind">{src.sourceKind}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}

      {failedItems.length > 0 ? (
        <li className="error">
          <div className="risk-item-header">
            <Icon name="fileText" className="risk-icon" />
            <strong>论文处理失败</strong>
            {failedItems.length > 1 ? (
              <Badge variant="outline" className="risk-count-badge">x{failedItems.length}</Badge>
            ) : null}
          </div>
          <p className="risk-description">
            {failedItems.length === 1
              ? failedItems[0].title
              : `今日有 ${failedItems.length} 篇论文下载或解析失败`}
          </p>
          <details className="risk-failed-details" open={failedItems.length === 1}>
            <summary>{failedItems.length > 1 ? '查看详情' : '失败详情'}</summary>
            <ul className="risk-source-list">
              {failedItems.map((item, index) => {
                const canRescue = isFailedItemRescueEligible(item)
                const busy = item.paper_id != null && rescuingPaperId === item.paper_id
                return (
                  <li key={`${item.title}-${index}`} className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="risk-source-name">{item.title}</span>
                      {item.spis_status ? (
                        <Badge variant="outline">{spisStatusLabel(item.spis_status)}</Badge>
                      ) : null}
                    </div>
                    <p className="risk-suggestion">{item.reason || item.spis_reason || '可以在论文库中重试处理'}</p>
                    {canRescue && onSpisRescue ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || item.paper_id == null}
                        onClick={() => void onSpisRescue(item)}
                      >
                        {busy ? '提交中...' : 'SPIS 补救'}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </details>
        </li>
      ) : null}
    </ul>
  )
}
