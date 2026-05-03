import { useEffect, useId, useState } from 'react'

import type { DailyBriefingSnapshot } from '../types'

export function BriefingProjectsSidebar({ briefing }: { briefing: DailyBriefingSnapshot }) {
  const [isOpen, setIsOpen] = useState(false)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  if (briefing.projects.length === 0) {
    return null
  }

  return (
    <section className="briefing-projects-launcher" aria-label="相关项目">
      <button
        type="button"
        className="briefing-projects-button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span>
          <small>延伸阅读</small>
          <strong>相关项目</strong>
        </span>
        <b>{briefing.projects.length}</b>
        <em>点击查看今日所有项目简介</em>
      </button>

      {isOpen ? (
        <div
          className="briefing-projects-modal-backdrop"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <section
            className="briefing-projects-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="briefing-projects-modal-header">
              <div>
                <p>今日项目雷达</p>
                <h2 id={titleId}>相关项目简介</h2>
              </div>
              <button
                type="button"
                className="briefing-projects-close"
                onClick={() => setIsOpen(false)}
              >
                关闭
              </button>
            </header>

            <ol className="briefing-projects-modal-list">
              {briefing.projects.map((project) => (
                <li key={`${project.rank}-${project.title}`}>
                  <span>#{project.rank}</span>
                  <div>
                    <a href={project.url} target="_blank" rel="noreferrer">
                      {project.title}
                    </a>
                    <p>{project.summary}</p>
                    <small>{project.source_kind}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </section>
  )
}
