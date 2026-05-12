import { useState } from 'react'
import { Icon } from '../UiIcon'
import { Button } from '@/components/ui/button'

type LibraryToolbarProps = {
  isLoadingLibrary: boolean
  totalPapers: number
  pendingCount: number
  parseFailedCount: number
  isRetryingParseFailed: boolean
  isDeletingParseFailed: boolean
  onOpenImport: () => void
  onToggleCreateCategory: () => void
  onRefresh: () => void | Promise<void>
  onRetryParseFailed: () => void | Promise<void>
  onDeleteParseFailed: () => void | Promise<void>
}

export function LibraryToolbar({
  isLoadingLibrary,
  totalPapers,
  pendingCount,
  parseFailedCount,
  isRetryingParseFailed,
  isDeletingParseFailed,
  onOpenImport,
  onToggleCreateCategory,
  onRefresh,
  onRetryParseFailed,
  onDeleteParseFailed,
}: LibraryToolbarProps) {
  const isBulkBusy = isRetryingParseFailed || isDeletingParseFailed
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <section className="library-toolbar" aria-label="论文操作">
      <div className="library-toolbar-summary" aria-live="polite" role="status">
        <span>{totalPapers} 篇论文</span>
        <span>{pendingCount} 篇待确认</span>
        <span>{parseFailedCount} 篇解析失败</span>
        {isLoadingLibrary && (
          <span className="sync-indicator">
            <span className="spinner" />
            同步中
          </span>
        )}
      </div>

      <div className="library-toolbar-actions">
        <Button variant="default" size="sm" onClick={onOpenImport}>
          <Icon name="upload" />
          导入 PDF
        </Button>
        <Button variant="outline" size="sm" onClick={onToggleCreateCategory}>
          <Icon name="library" />
          新建分类
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
          <Icon name="refresh" />
          刷新
        </Button>

        {parseFailedCount > 0 && (
          <div className="more-menu-wrapper">
            <Button variant="outline" size="sm" onClick={() => setMoreOpen((v) => !v)} aria-label="更多操作">
              更多操作 ▾
            </Button>
            {moreOpen && (
              <div className="more-menu-dropdown">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBulkBusy}
                  onClick={() => { void onRetryParseFailed(); setMoreOpen(false) }}
                >
                  {isRetryingParseFailed ? '重试中...' : '重试解析失败'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isBulkBusy}
                  onClick={() => { void onDeleteParseFailed(); setMoreOpen(false) }}
                >
                  {isDeletingParseFailed ? '删除中...' : '删除失败记录'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
