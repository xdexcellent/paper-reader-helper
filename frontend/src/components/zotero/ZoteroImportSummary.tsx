import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import type { ZoteroRunResponse } from '../../types'

interface Props {
  run: ZoteroRunResponse
}

export function ZoteroImportSummary({ run }: Props) {
  const items = [
    { label: '已导入', count: run.imported_count, className: 'text-emerald-600 dark:text-emerald-400' },
    { label: '已跳过', count: run.skipped_count, className: 'text-muted-foreground' },
    { label: '重复', count: run.duplicate_count, className: 'text-amber-600 dark:text-amber-400' },
    { label: '警告', count: run.warning_count, className: 'text-orange-600 dark:text-orange-400' },
    { label: '失败', count: run.failed_count, className: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <Card
      className="zotero-import-summary overflow-hidden rounded-lg border-border/70 bg-card shadow-sm"
      role="region"
      aria-label="导入汇总"
    >
      <CardHeader className="border-b border-border/70 pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">导入结果汇总</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-0 p-0 sm:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-1 border-border/70 px-4 py-5 text-center first:border-l-0 sm:border-l"
          >
            <strong className={`text-2xl font-bold leading-none ${item.className}`}>
              {item.count}
            </strong>
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
