import { useEffect, useId, useState } from 'react'

import type { DailyBriefingSnapshot } from '../types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function BriefingProjectsSidebar({ briefing }: { briefing: DailyBriefingSnapshot }) {
  const [isOpen, setIsOpen] = useState(false)
  const titleId = useId()

  // shadcn Dialog 已内置 body scroll lock 和 Escape 关闭，无需手动处理


  if (briefing.projects.length === 0) {
    return null
  }

  const previewProjects = briefing.projects.slice(0, 3)
  const remainingCount = briefing.projects.length - previewProjects.length

  return (
    <section className="briefing-projects-launcher" aria-label="相关项目">
      <ul className="briefing-projects-preview">
        {previewProjects.map((project) => (
          <li key={`preview-${project.rank}-${project.title}`}>
            <span className="preview-rank">#{project.rank}</span>
            <div>
              <strong>{project.title}</strong>
              <small>{project.source_kind}</small>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        className="briefing-projects-button w-full"
        onClick={() => setIsOpen(true)}
      >
        <span>
          <small>延伸阅读</small>
          <strong>查看所有相关项目</strong>
        </span>
        <b>{briefing.projects.length}</b>
        <em>
          {remainingCount > 0
            ? `点击在大弹窗中查看全部 ${briefing.projects.length} 个项目简介`
            : '点击在大弹窗中查看完整简介'}
        </em>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>相关项目简介 · 共 {briefing.projects.length} 个</DialogTitle>
            <DialogDescription>今日项目雷达</DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </section>
  )
}
