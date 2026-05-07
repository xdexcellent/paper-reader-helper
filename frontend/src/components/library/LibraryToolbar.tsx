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

  return (
    <section className="library-toolbar" aria-label="Library actions">
      <div className="library-toolbar-summary" aria-live="polite" role="status">
        <span>{totalPapers} papers</span>
        <span>{pendingCount} pending</span>
        <span>{parseFailedCount} parse failed</span>
        {isLoadingLibrary && (
          <span className="sync-indicator">
            <span className="spinner" />
            Syncing
          </span>
        )}
      </div>

      <div className="library-toolbar-actions">
        <button aria-label="Import PDF" className="btn btn-primary" onClick={onOpenImport} type="button">
          <Icon name="upload" />
          Import PDF
        </button>
        <button
          aria-label="Create category"
          className="btn btn-action"
          onClick={onToggleCreateCategory}
          type="button"
        >
          <Icon name="library" />
          Create category
        </button>
        <button aria-label="Refresh library" className="btn btn-action" onClick={onRefresh} type="button">
          <Icon name="refresh" />
          Refresh
        </button>
      </div>

      {parseFailedCount > 0 && (
        <div className="library-toolbar-bulk">
          <button
            aria-label="Retry parse failures"
            className="btn btn-action"
            disabled={isBulkBusy}
            onClick={onRetryParseFailed}
            type="button"
          >
            {isRetryingParseFailed ? 'Retrying...' : 'Retry failed parses'}
          </button>
          <button
            aria-label="Delete parse failures"
            className="btn btn-action parse-failed-delete-btn"
            disabled={isBulkBusy}
            onClick={onDeleteParseFailed}
            type="button"
          >
            {isDeletingParseFailed ? 'Deleting...' : 'Delete failed parses'}
          </button>
        </div>
      )}
    </section>
  )
}
