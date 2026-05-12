import { Icon } from '../UiIcon'
import type { ZoteroHistoryEntry } from './zoteroHistory'

interface Props {
  entries: ZoteroHistoryEntry[]
  onReplay: (sourcePath: string) => void
  onClear: () => void
}

function formatRelative(iso: string): string {
  if (!iso) return '未知时间'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
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

function truncatePath(path: string, max = 52): string {
  if (path.length <= max) return path
  const head = Math.floor(max / 2) - 2
  const tail = max - head - 3
  return `${path.slice(0, head)}…${path.slice(-tail)}`
}

export function ZoteroHistoryPanel({ entries, onReplay, onClear }: Props) {
  if (entries.length === 0) return null

  return (
    <section className="zotero-history-panel" aria-label="最近导入记录">
      <header className="zotero-history-header">
        <div className="zotero-history-title">
          <Icon name="calendar" />
          <h3>最近扫描</h3>
          <span className="zotero-history-count">{entries.length}</span>
        </div>
        <button
          type="button"
          className="zotero-history-clear"
          onClick={onClear}
          aria-label="清空最近扫描记录"
        >
          清空
        </button>
      </header>
      <ul className="zotero-history-list">
        {entries.map((entry) => (
          <li key={entry.run_id} className="zotero-history-item">
            <div className="zotero-history-item-main">
              <span className="zotero-history-path" title={entry.source_path}>
                {truncatePath(entry.source_path)}
              </span>
              <span className="zotero-history-time">{formatRelative(entry.scanned_at)}</span>
            </div>
            <div className="zotero-history-metrics">
              <span>
                候选 <strong>{entry.candidate_count}</strong>
              </span>
              <span>
                已导入 <strong>{entry.imported_count}</strong>
              </span>
              {entry.skipped_count > 0 && (
                <span>
                  跳过 <strong>{entry.skipped_count}</strong>
                </span>
              )}
              {entry.failed_count > 0 && (
                <span className="zotero-history-metric-fail">
                  失败 <strong>{entry.failed_count}</strong>
                </span>
              )}
            </div>
            <button
              type="button"
              className="zotero-history-replay"
              onClick={() => onReplay(entry.source_path)}
              aria-label={`使用此路径重新扫描：${entry.source_path}`}
            >
              <Icon name="refresh" />
              重新扫描
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
