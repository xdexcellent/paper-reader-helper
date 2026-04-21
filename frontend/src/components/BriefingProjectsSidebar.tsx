import type { DailyBriefingSnapshot } from '../types'

export function BriefingProjectsSidebar({ briefing }: { briefing: DailyBriefingSnapshot }) {
  if (briefing.projects.length === 0) {
    return null
  }

  return (
    <aside className="briefing-projects-sidebar" aria-label="相关项目">
      <div className="briefing-side-title">
        <h3>相关项目</h3>
        <span>{briefing.projects.length}</span>
      </div>
      <ol>
        {briefing.projects.map((project) => (
          <li key={`${project.rank}-${project.title}`}>
            <a href={project.url} target="_blank" rel="noreferrer">
              {project.title}
            </a>
            <p>{project.summary}</p>
            <small>{project.source_kind}</small>
          </li>
        ))}
      </ol>
    </aside>
  )
}
