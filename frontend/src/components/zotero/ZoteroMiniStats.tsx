import { Icon } from '../UiIcon'
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

export function ZoteroMiniStats({ zoteroPaperCount, history }: Props) {
  const lastScan = history[0]
  const totalImported = history.reduce((sum, entry) => sum + entry.imported_count, 0)

  const stats: Array<{ icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string; hint?: string }> = [
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
    <div className="zotero-mini-stats" role="group" aria-label="Zotero 导入概览">
      {stats.map((stat) => (
        <div key={stat.label} className="zotero-mini-stat">
          <div className="zotero-mini-stat-icon" aria-hidden="true">
            <Icon name={stat.icon} />
          </div>
          <div className="zotero-mini-stat-body">
            <span className="zotero-mini-stat-value">{stat.value}</span>
            <span className="zotero-mini-stat-label">{stat.label}</span>
            {stat.hint && <span className="zotero-mini-stat-hint">{stat.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
