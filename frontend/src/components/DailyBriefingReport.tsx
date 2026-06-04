import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DailyBriefingSnapshot } from '../types'
import {
  cleanMarkdownSummaryLine,
  getHeadingId,
  getNodeText,
  stripOverviewSection,
} from './DailyBriefingShell.helpers'
import type { BriefingOutlineItem } from './DailyBriefingShell.helpers'

export function DailyBriefingReport({
  activeOutlineId,
  briefing,
  briefingHighlights,
  getBriefingPaperLinkId,
  isTodaySelected,
  keywordSummary,
  onOpenPaper,
  outlineForDisplay,
  outlineItems,
  readOrderText,
  riskLevelLabel,
  setActiveOutlineId,
}: {
  activeOutlineId: string
  briefing: DailyBriefingSnapshot
  briefingHighlights: string[]
  getBriefingPaperLinkId: (href: string | undefined, children: ReactNode) => number | null
  isTodaySelected: boolean
  keywordSummary: string
  onOpenPaper: (paperId: number) => void
  outlineForDisplay: BriefingOutlineItem[]
  outlineItems: BriefingOutlineItem[]
  readOrderText: string
  riskLevelLabel: string
  setActiveOutlineId: (id: string) => void
}) {
  return (
    <article className="briefing-main">
      <Card className="h-full border-border/60 bg-card/85 dark:bg-card/60">
        <CardContent className="briefing-main-layout">
          <nav className="briefing-document-outline" aria-label="文档目录">
            <div className="briefing-outline-title">文档目录</div>
            <ScrollArea className="max-h-[60vh]">
              <a href="#briefing-highlights" className={activeOutlineId === 'briefing-highlights' ? 'active' : ''} title="今日重点" onClick={() => setActiveOutlineId('briefing-highlights')}>
                今日重点
              </a>
              {outlineForDisplay.map((item) => (
                <a key={item.id} href={`#${item.id}`} className={`${activeOutlineId === item.id ? 'active' : ''} level-${item.level}`} title={item.label} onClick={() => setActiveOutlineId(item.id)}>
                  {item.label}
                </a>
              ))}
            </ScrollArea>
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
                  <div><dt>今日关键词</dt><dd>{keywordSummary}</dd></div>
                  <div><dt>风险等级</dt><dd>{riskLevelLabel}</dd></div>
                  <div><dt>推荐阅读顺序</dt><dd>{readOrderText}</dd></div>
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
                        <a href={`/paper/${paperId}`} onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onOpenPaper(paperId)
                        }}>
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
                <summary><strong>失败论文 {briefing.failed_items.length} 篇</strong><span>展开查看每篇失败原因</span></summary>
                <ul className="briefing-failed-list">
                  {briefing.failed_items.map((item, index) => (
                    <li key={`${index}-${item.title}`}>
                      <div className="briefing-failed-title">
                        {item.canonical_url ? <a href={item.canonical_url} target="_blank" rel="noreferrer">{item.title}</a> : <span>{item.title}</span>}
                        <span className="briefing-failed-source">{item.source_kind}</span>
                      </div>
                      <div className="briefing-failed-reason">{item.reason}</div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </article>
  )
}
