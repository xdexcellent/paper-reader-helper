import { cn } from '@/lib/utils'

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const normalized = value?.toLowerCase() ?? ''

  let variant: 'default' | 'processing' | 'done' | 'error' = 'default'
  if (normalized.includes('done') || normalized.includes('completed') || normalized.includes('success')) {
    variant = 'done'
  } else if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('fail')) {
    variant = 'error'
  } else if (
    normalized.includes('processing')
    || normalized.includes('running')
    || normalized.includes('pending')
    || normalized.includes('waiting')
  ) {
    variant = 'processing'
  }

  const labelMap: Record<string, { label: string; icon?: string }> = {
    done: { label: '完成', icon: '✓' },
    completed: { label: '完成', icon: '✓' },
    success: { label: '成功', icon: '✓' },
    error: { label: '错误', icon: '⚠' },
    failed: { label: '失败', icon: '✕' },
    fail: { label: '失败', icon: '✕' },
    processing: { label: '处理中', icon: '⟳' },
    running: { label: '运行中', icon: '▶' },
    pending: { label: '等待中', icon: '…' },
    waiting: { label: '等待中', icon: '…' },
    disabled: { label: '已关闭' },
    fallback: { label: '回退中' },
    manual: { label: '手动' },
    scheduled: { label: '自动' },
    parsing: { label: '解析中', icon: '⟳' },
    parsed: { label: '已解析', icon: '✓' },
    parse_failed: { label: '解析失败', icon: '✕' },
    ready: { label: '就绪', icon: '✓' },
    imported: { label: '已导入', icon: '✓' },
    unclassified: { label: '未分类' },
    manual_locked: { label: '手动锁定', icon: '🔒' },
    pending_review: { label: '待审核', icon: '…' },
    queued: { label: '排队中', icon: '…' },
    summarizing: { label: '摘要中', icon: '⟳' },
    summarize_failed: { label: '摘要失败', icon: '✕' },
    embedding: { label: '向量化中', icon: '⟳' },
    embedding_failed: { label: '向量化失败', icon: '✕' },
    unavailable: { label: '暂不可用' },
  }

  const entry = labelMap[normalized]
  const displayLabel = entry?.label ?? value
  const icon = entry?.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variant === 'done' && 'border-green-500/35 bg-gradient-to-br from-green-500/22 to-green-400/14 text-green-500 dark:text-green-400',
        variant === 'error' && 'border-red-500/40 bg-gradient-to-br from-red-500/22 to-red-400/14 text-red-500 dark:text-red-400 animate-[error-pulse_2.5s_ease-in-out_infinite]',
        variant === 'processing' && 'border-blue-500/35 bg-gradient-to-br from-blue-500/22 to-indigo-400/14 text-blue-600 dark:text-blue-400',
        variant === 'default' && 'border-border bg-muted text-muted-foreground',
        className,
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {displayLabel}
    </span>
  )
}
