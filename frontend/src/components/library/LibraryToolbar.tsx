import { useState } from 'react'
import { Icon } from '../UiIcon'

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
        <button aria-label="导入 PDF" className="btn btn-primary" onClick={onOpenImport} type="button">
          <Icon name="upload" />
          导入 PDF
        </button>
        <button
          aria-label="新建分类"
          className="btn btn-action"
          onClick={onToggleCreateCategory}
          type="button"
        >
          <Icon name="library" />
          新建分类
        </button>
        <button aria-label="刷新" className="btn btn-action" onClick={onRefresh} type="button">
          <Icon name="refresh" />
          刷新
        </button>

        {parseFailedCount > 0 && (
          <div className="more-menu-wrapper">
            <button
              aria-label="更多操作"
              className="btn btn-action"
              onClick={() => setMoreOpen((v) => !v)}
              type="button"
            >
              更多操作 ▾
            </button>
            {moreOpen && (
              <div className="more-menu-dropdown">
                <button
                  disabled={isBulkBusy}
                  onClick={() => { onRetryParseFailed(); setMoreOpen(false) }}
                  type="button"
                >
                  {isRetryingParseFailed ? '重试中...' : '重试解析失败'}
                </button>
                <button
                  className="danger"
                  disabled={isBulkBusy}
                  onClick={() => { onDeleteParseFailed(); setMoreOpen(false) }}
                  type="button"
                >
                  {isDeletingParseFailed ? '删除中...' : '删除失败记录'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
