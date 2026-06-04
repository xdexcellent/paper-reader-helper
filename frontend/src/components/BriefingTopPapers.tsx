import { useState } from 'react'

import type { DailyBriefingSnapshot, Paper } from '../types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const DEFAULT_VISIBLE_PAPERS = 3

function getPaperCardKey(rank: number, paperId: number | null, title: string): string {
  return `${rank}-${paperId ?? title}`
}

function getPriorityLabel(item: DailyBriefingSnapshot['top_papers'][number]): { text: string; tone: string } {
  if (item.paper_id === null) return { text: '待确认', tone: 'pending' }
  if (item.rank <= 3 || item.score >= 120) return { text: '高优先级', tone: 'high' }
  return { text: '参考', tone: 'reference' }
}

function getRecommendedAction(item: DailyBriefingSnapshot['top_papers'][number]): string {
  if (item.paper_id === null) return '待确认'
  if (item.rank === 1 || item.score >= 150) return '优先精读'
  if (item.rank <= 3 || item.score >= 120) return '略读验证'
  return '收藏跟进'
}

function getReaderFit(sourceKind: string, directionTag?: string): string {
  if (directionTag) return `${directionTag} 方向读者`
  if (/openreview/i.test(sourceKind)) return '关注评审动态的读者'
  if (/github/i.test(sourceKind)) return '跟进项目落地的读者'
  return '做今日方向筛选的读者'
}

function getTopicTags(
  item: DailyBriefingSnapshot['top_papers'][number],
  paper: Paper | undefined,
): string[] {
  const candidates = [
    item.source_kind,
    paper?.tags?.[0],
    item.rank <= 3 ? 'Top 3' : undefined,
  ]

  return candidates
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(value => value.trim())
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 3)
}

export function BriefingTopPapers({
  briefing,
  papers,
  onOpenPaper,
  initialVisibleCount = DEFAULT_VISIBLE_PAPERS,
}: {
  briefing: DailyBriefingSnapshot
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
  initialVisibleCount?: number
}) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [showAllPapers, setShowAllPapers] = useState(false)

  if (briefing.top_papers.length === 0) {
    return <div className="briefing-empty">今天还没有可展示的关键建议。</div>
  }

  const visibleCount = Math.min(initialVisibleCount, briefing.top_papers.length)
  const visiblePapers = showAllPapers ? briefing.top_papers : briefing.top_papers.slice(0, visibleCount)
  const hasHiddenPapers = briefing.top_papers.length > visibleCount

  return (
    <div className="briefing-top-papers" aria-label="关键建议">
      {visiblePapers.map((item) => {
        const paperId = item.paper_id
        const paper = paperId === null ? undefined : papers.find(p => p.id === paperId)
        const title = item.title || paper?.title || `论文 ${paperId ?? item.rank}`
        const valueText = item.reason || item.summary_text || '值得加入今日优先阅读队列。'
        const summaryText = item.summary_text && item.summary_text !== valueText ? item.summary_text : ''
        const directionTag = paper?.tags?.[0]
        const cardKey = getPaperCardKey(item.rank, paperId, title)
        const expanded = expandedCards.has(cardKey)
        const priority = getPriorityLabel(item)
        const recommendedAction = getRecommendedAction(item)
        const readerFit = getReaderFit(item.source_kind, directionTag)
        const topicTags = getTopicTags(item, paper)
        return (
          <Card
            key={cardKey}
            className={cn(
              'briefing-top-paper-card',
              `priority-${priority.tone}`,
              paperId === null && 'disabled',
            )}
          >
            <CardContent className="briefing-top-paper-body">
              <div className="briefing-top-paper-heading">
                <span className="briefing-top-paper-rank">#{item.rank}</span>
                <div className="briefing-top-paper-title-group">
                  <Badge variant="outline" className={`briefing-priority-label ${priority.tone}`}>
                    {priority.text}
                  </Badge>
                  <h3>{title}</h3>
                </div>
              </div>
              <div className="briefing-top-paper-decision" aria-label="建议动作">
                <div>
                  <span>建议动作</span>
                  <strong>{recommendedAction}</strong>
                </div>
                <div>
                  <span>适合谁看</span>
                  <strong>{readerFit}</strong>
                </div>
              </div>
              <div className="briefing-top-paper-reason">
                <span>为什么推荐</span>
                <p>{valueText}</p>
              </div>
              <div className="briefing-paper-meta" aria-label="关联主题">
                <span className="briefing-paper-meta-label">关联主题：</span>
                {topicTags.map(tag => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {summaryText ? (
                <div className="briefing-top-paper-summary-block">
                  <p className={`briefing-top-paper-summary${expanded ? ' expanded' : ''}`}>{summaryText}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="briefing-top-paper-summary-toggle"
                    onClick={() => {
                      setExpandedCards((current) => {
                        const next = new Set(current)
                        if (next.has(cardKey)) {
                          next.delete(cardKey)
                        } else {
                          next.add(cardKey)
                        }
                        return next
                      })
                    }}
                  >
                    {expanded ? '收起摘要' : '展开摘要'}
                  </Button>
                </div>
              ) : null}
              {paperId !== null ? (
                <Button
                  type="button"
                  size="sm"
                  className="briefing-top-paper-open"
                  onClick={() => onOpenPaper?.(paperId)}
                >
                  打开论文
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
      {hasHiddenPapers ? (
        <Button
          variant="outline"
          size="sm"
          aria-expanded={showAllPapers}
          onClick={() => setShowAllPapers((current) => !current)}
        >
          {showAllPapers ? `收起至 ${visibleCount} 条建议` : `展开全部 ${briefing.top_papers.length} 条建议`}
        </Button>
      ) : null}
    </div>
  )
}
