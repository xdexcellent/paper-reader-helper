import { Icon } from '../UiIcon'
import type { IconName } from '../UiIcon'

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
    <ol className="zotero-step-bar" aria-label="Zotero 导入流程">
      {STEPS.map((step) => {
        const isCurrent = step.id === current
        const isCompleted = completed.includes(step.id) || step.index < activeIndex
        const state = isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming'
        return (
          <li key={step.id} className={`zotero-step zotero-step-${state}`} aria-current={isCurrent ? 'step' : undefined}>
            <div className="zotero-step-marker" aria-hidden="true">
              {isCompleted ? <Icon name="check" /> : <Icon name={step.icon} />}
            </div>
            <div className="zotero-step-body">
              <span className="zotero-step-index">第 {step.index} 步</span>
              <strong className="zotero-step-title">{step.title}</strong>
              <span className="zotero-step-desc">{step.description}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
