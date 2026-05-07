import type { ZoteroRunResponse } from '../../types'

interface Props {
  run: ZoteroRunResponse
}

export function ZoteroImportSummary({ run }: Props) {
  const items = [
    { label: '已导入', count: run.imported_count, color: 'var(--color-success, #10b981)' },
    { label: '已跳过', count: run.skipped_count, color: 'var(--color-muted, #888)' },
    { label: '重复', count: run.duplicate_count, color: 'var(--color-warning, #f59e0b)' },
    { label: '警告', count: run.warning_count, color: 'var(--color-danger, #ef4444)' },
    { label: '失败', count: run.failed_count, color: 'var(--color-danger, #ef4444)' },
  ]

  return (
    <div className="zotero-import-summary" role="region" aria-label="导入汇总">
      {items.map((item) => (
        <div key={item.label} className="zotero-import-summary-item">
          <div className="count" style={{ color: item.color }}>
            {item.count}
          </div>
          <div className="label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
