import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
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
    <Card
      className="zotero-history-panel rounded-lg border-border/70 bg-card shadow-sm"
      aria-label="最近导入记录"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon name="calendar" className="size-4 text-blue-600" />
          最近扫描
          <Badge className="h-5 min-w-[22px] rounded-full bg-blue-500/15 px-1.5 text-[0.65rem] font-medium text-blue-600">
            {entries.length}
          </Badge>
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
          onClick={onClear}
          aria-label="清空最近扫描记录"
        >
          清空
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pb-4">
        {entries.map((entry) => (
          <div
            key={entry.run_id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 transition-colors hover:border-blue-500/35"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className="truncate font-mono text-xs text-foreground"
                title={entry.source_path}
              >
                {truncatePath(entry.source_path)}
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                {formatRelative(entry.scanned_at)}
              </span>
            </div>
            <div className="flex gap-3 text-[0.72rem] text-muted-foreground whitespace-nowrap">
              <span>
                候选 <strong className="font-semibold text-foreground">{entry.candidate_count}</strong>
              </span>
              <span>
                已导入 <strong className="font-semibold text-foreground">{entry.imported_count}</strong>
              </span>
              {entry.skipped_count > 0 && (
                <span>
                  跳过 <strong className="font-semibold text-foreground">{entry.skipped_count}</strong>
                </span>
              )}
              {entry.failed_count > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  失败 <strong className="font-semibold">{entry.failed_count}</strong>
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 rounded-md px-2 text-xs"
              onClick={() => onReplay(entry.source_path)}
              aria-label={`使用此路径重新扫描：${entry.source_path}`}
            >
              <Icon name="refresh" className="size-3" />
              重新扫描
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
