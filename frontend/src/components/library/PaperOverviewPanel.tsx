import type { PaperDetail } from '../../types'

type PaperOverviewPanelProps = {
  paper: PaperDetail | null
  singleColumn?: boolean
}

type OverviewSection = {
  label: string
  value: string
}

function buildOverviewSections(paper: PaperDetail): OverviewSection[] {
  return [
    { label: '简要结论', value: paper.one_line_summary },
    { label: '核心贡献', value: paper.core_contributions },
    { label: '方法概述', value: paper.method_summary },
    { label: '应用场景', value: paper.use_cases },
    { label: '局限性', value: paper.limitations },
    { label: '相关说明', value: paper.relevance_note },
  ].filter((section) => section.value.trim())
}

export function PaperOverviewPanel({ paper, singleColumn = false }: PaperOverviewPanelProps) {
  if (!paper) {
    return (
      <section className="paper-overview-panel paper-panel-empty">
        <span>选择一篇论文查看审阅概览。</span>
      </section>
    )
  }

  const sections = buildOverviewSections(paper)

  return (
    <section className={`paper-overview-panel${singleColumn ? ' single-column' : ''}`} aria-label="论文概览">
      <div className="paper-overview-header">
        <p className="panel-chip">审阅概览</p>
        <h2>论文概览</h2>
      </div>

      {sections.length === 0 ? (
        <div className="paper-panel-empty">
          暂无审阅概览。生成摘要后将填充这些信息。
        </div>
      ) : (
        <div className="paper-overview-grid">
          {sections.map((section) => (
            <article className="paper-overview-section" key={section.label}>
              <h3>{section.label}</h3>
              <p>{section.value}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
