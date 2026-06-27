import { Card, CardContent } from '../ui/card'
import { Icon } from '../UiIcon'
import type { IconName } from '../UiIcon'
import { cn } from '../../lib/utils'
import type { ZoteroHistoryEntry } from './zoteroHistory'

interface Props {
  /** Zotero 来源已导入论文总数（-1 表示尚未加载） */
  zoteroPaperCount: number
  history: ZoteroHistoryEntry[]
}

function formatShortTime(iso: string): string {
  if (!iso) return '暂无记录'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '暂无记录'
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} 天前`
  return date.toLocaleDateString()
}

const metricToneClasses = [
  'bg-sky-500/10 text-sky-600',
  'bg-blue-500/10 text-blue-600',
  'bg-emerald-500/10 text-emerald-600',
]

export function ZoteroMiniStats({ zoteroPaperCount, history }: Props) {
  const lastScan = history[0]
  const totalImported = history.reduce((sum, entry) => sum + entry.imported_count, 0)

  const stats: Array<{ icon: IconName; label: string; value: string; hint?: string }> = [
    {
      icon: 'library',
      label: '来自 Zotero 的论文',
      value: zoteroPaperCount < 0 ? '…' : String(zoteroPaperCount),
      hint: zoteroPaperCount < 0 ? '加载中' : '当前已收录',
    },
    {
      icon: 'calendar',
      label: '最近一次扫描',
      value: lastScan ? formatShortTime(lastScan.scanned_at) : '暂无',
      hint: lastScan ? `候选 ${lastScan.candidate_count}` : '开始首次扫描',
    },
    {
      icon: 'check',
      label: '本会话已导入',
      value: String(totalImported),
      hint: '本浏览器最近记录',
    },
  ]

  return (
    <Card className="zotero-mini-stats overflow-hidden rounded-lg border-border/70 bg-card shadow-sm">
      <CardContent
        className="grid gap-0 p-0 sm:grid-cols-3"
        role="group"
        aria-label="Zotero 导入概览"
      >
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 border-border/70 px-5 py-4 first:border-l-0 sm:border-l"
          >
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                metricToneClasses[index % metricToneClasses.length],
              )}
            >
              <Icon name={stat.icon} className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
              <strong className="mt-1 block text-xl font-semibold leading-none text-foreground">
                {stat.value}
              </strong>
              {stat.hint && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">{stat.hint}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
