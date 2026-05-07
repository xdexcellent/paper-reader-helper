import type { PaperDetail } from '../../types'

type PaperOverviewPanelProps = {
  paper: PaperDetail | null
}

type OverviewSection = {
  label: string
  value: string
}

function buildOverviewSections(paper: PaperDetail): OverviewSection[] {
  return [
    { label: 'Quick conclusion', value: paper.one_line_summary },
    { label: 'Core contributions', value: paper.core_contributions },
    { label: 'Method overview', value: paper.method_summary },
    { label: 'Use cases', value: paper.use_cases },
    { label: 'Limitations', value: paper.limitations },
    { label: 'Relevance note', value: paper.relevance_note },
  ].filter((section) => section.value.trim())
}

export function PaperOverviewPanel({ paper }: PaperOverviewPanelProps) {
  if (!paper) {
    return (
      <section className="paper-overview-panel paper-panel-empty">
        <span>Select a paper to review its overview.</span>
      </section>
    )
  }

  const sections = buildOverviewSections(paper)

  return (
    <section className="paper-overview-panel" aria-label="Paper overview">
      <div className="paper-overview-header">
        <p className="panel-chip">Screening</p>
        <h2>Paper overview</h2>
      </div>

      {sections.length === 0 ? (
        <div className="paper-panel-empty">
          No overview yet. Generate a summary to populate these sections.
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
