export function StatusBadge({ value }: { value: string }) {
  const normalized = value?.toLowerCase() ?? ''

  let className = 'status-badge'
  if (normalized.includes('done') || normalized.includes('completed') || normalized.includes('success')) {
    className += ' status-done'
  } else if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('fail')) {
    className += ' status-error'
  } else if (
    normalized.includes('processing')
    || normalized.includes('running')
    || normalized.includes('pending')
    || normalized.includes('waiting')
  ) {
    className += ' status-processing'
  } else if (normalized.includes('disabled') || normalized.includes('fallback')) {
    className += ' status-default'
  } else {
    className += ' status-default'
  }

  const labelMap: Record<string, string> = {
    done: '完成',
    completed: '完成',
    success: '成功',
    error: '错误',
    failed: '失败',
    fail: '失败',
    processing: '处理中',
    running: '运行中',
    pending: '等待中',
    waiting: '等待中',
    disabled: '已关闭',
    fallback: '回退中',
    manual: '手动',
    scheduled: '自动',
    parsed: '已解析',
    ready: '就绪',
    imported: '已导入',
    unclassified: '未分类',
    manual_locked: '手动锁定',
    pending_review: '待审核',
    queued: '排队中',
    summarizing: '摘要中',
  }

  const displayLabel = labelMap[normalized] ?? value

  return (
    <span className={className}>
      {displayLabel}
    </span>
  )
}
