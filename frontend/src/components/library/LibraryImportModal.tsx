import type { Paper } from '../../types'
import { ImportConfirmDialog } from './ImportConfirmDialog'
import type { ImportConfirmPayload } from './libraryTypes'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type LibraryImportModalProps = {
  papers: Paper[]
  isSubmitting: boolean
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: ImportConfirmPayload) => Promise<boolean>
}

export function LibraryImportModal({ papers, isSubmitting, isOpen, onClose, onSubmit }: LibraryImportModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>导入论文</DialogTitle>
          <DialogDescription>上传 PDF 文件并确认元数据信息。</DialogDescription>
        </DialogHeader>
        <ImportConfirmDialog
          existingPapers={papers}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
