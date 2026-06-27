import { PriorityPaperCard, type PriorityPaperCardProps } from './PriorityPaperCard'

export type PrioritySectionProps = {
  papers: Omit<PriorityPaperCardProps, 'onRead' | 'onAddToProject' | 'onDismiss' | 'onFavoriteChange'>[]
  onReadPaper?: (index: number) => void
  onViewAll?: () => void
  onAddToProject?: (title: string) => void
  onFavoriteChange?: () => void
}

export function PrioritySection({ papers, onReadPaper, onViewAll, onAddToProject, onFavoriteChange }: PrioritySectionProps) {
  const displayPapers = papers.slice(0, 3)

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[16px] font-semibold text-[#0F172A]">
            今日重点 / 优先阅读
          </h2>
          <span className="rounded-full bg-[#EFF6FF] px-2.5 py-[3px] text-[11px] font-medium text-[#2563EB]">
            为你精选的高价值论文
          </span>
        </div>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); onViewAll?.() }}
          className="text-[12px] text-[#2563EB] transition-colors duration-200 hover:text-[#1d4ed8]"
        >
          查看全部 →
        </a>
      </div>

      {/* Paper cards — vertical list in a container */}
      <div className="dash-priority-list rounded-[20px] bg-white p-4 space-y-2" style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.03)' }}>
        {displayPapers.map((paper, index) => (
          <PriorityPaperCard
            key={`priority-${paper.rank}`}
            {...paper}
            onRead={() => onReadPaper?.(index)}
            onAddToProject={onAddToProject}
            onFavoriteChange={onFavoriteChange}
          />
        ))}
      </div>
    </section>
  )
}
