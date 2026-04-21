import type { DailyBriefingSnapshot, Paper } from '../types'

export function BriefingTopPapers({
  briefing,
  papers,
  onOpenPaper,
}: {
  briefing: DailyBriefingSnapshot
  papers: Paper[]
  onOpenPaper?: (paperId: number) => void
}) {
  if (briefing.top_papers.length === 0) {
    return <div className="briefing-empty">今日还没有处理完成的精选论文。</div>
  }

  return (
    <div className="briefing-top-papers" aria-label="今日精选论文">
      {briefing.top_papers.map((item) => {
        const paper = item.paper_id === null ? undefined : papers.find(p => p.id === item.paper_id)
        const title = paper?.title ?? `论文 ${item.paper_id ?? item.rank}`
        return (
          <article
            key={`${item.rank}-${item.paper_id ?? title}`}
            className="briefing-top-paper-card"
            onClick={() => item.paper_id !== null && onOpenPaper?.(item.paper_id)}
          >
            <div className="briefing-top-paper-rank">#{item.rank}</div>
            <div className="briefing-top-paper-body">
              <h3>{title}</h3>
              <p>{item.reason}</p>
              <div className="briefing-paper-meta">
                <span>{item.source_kind}</span>
                <span>{Math.round(item.score * 100)} 分</span>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
