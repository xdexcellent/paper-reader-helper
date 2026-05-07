import type { Paper } from '../../types'
import { ImportConfirmDialog } from './ImportConfirmDialog'
import type { ImportConfirmPayload } from './libraryTypes'

type LibraryImportModalProps = {
  papers: Paper[]
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (payload: ImportConfirmPayload) => Promise<boolean>
}

export function LibraryImportModal({ papers, isSubmitting, onClose, onSubmit }: LibraryImportModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <ImportConfirmDialog
          existingPapers={papers}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
