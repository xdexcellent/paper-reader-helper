import { Card, CardContent } from '../ui/card'
import { Icon } from '../UiIcon'
import type { IconName } from '../UiIcon'
import { cn } from '../../lib/utils'

export type ZoteroStep = 'source' | 'review' | 'confirm'

interface Props {
  /** 当前激活到第几步（后续步骤视为未开始） */
  current: ZoteroStep
  /** 额外标记为完成的步骤（允许激活步之后也展示已完成） */
  completed?: ZoteroStep[]
}

interface StepDef {
  id: ZoteroStep
  index: number
  icon: IconName
  title: string
  description: string
}

const STEPS: StepDef[] = [
  {
    id: 'source',
    index: 1,
    icon: 'file',
    title: '指定路径',
    description: '选择 zotero.sqlite 文件',
  },
  {
    id: 'review',
    index: 2,
    icon: 'search',
    title: '预览候选',
    description: '过滤、检查重复与附件',
  },
  {
    id: 'confirm',
    index: 3,
    icon: 'check',
    title: '确认导入',
    description: '执行导入并查看结果',
  },
]

export function ZoteroStepBar({ current, completed = [] }: Props) {
  const activeIndex = STEPS.find((s) => s.id === current)?.index ?? 1

  return (
    <Card className="zotero-step-bar rounded-lg border-border/70 bg-card shadow-sm">
      <CardContent className="p-0">
        <ol
          className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
          aria-label="Zotero 导入流程"
        >
          {STEPS.map((step) => {
            const isCurrent = step.id === current
            const isCompleted = completed.includes(step.id) || step.index < activeIndex
            const state = isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming'
            return (
              <li
                key={step.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  state === 'current' && 'border-blue-500/50 bg-blue-500/5',
                  state === 'completed' && 'border-border/70 bg-muted/30',
                  state === 'upcoming' && 'border-border/70 bg-card opacity-70',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                    state === 'current' && 'border-transparent bg-blue-500 text-white shadow-[0_0_0_4px_rgba(59,130,246,0.2)]',
                    state === 'completed' && 'border-transparent bg-emerald-500 text-white',
                    state === 'upcoming' && 'border-border bg-muted/30 text-muted-foreground',
                  )}
                  aria-hidden="true"
                >
                  {isCompleted ? <Icon name="check" className="size-4" /> : <Icon name={step.icon} className="size-4" />}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                    第 {step.index} 步
                  </span>
                  <strong className="text-sm font-semibold text-foreground">{step.title}</strong>
                  <span className="text-xs leading-5 text-muted-foreground">{step.description}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
