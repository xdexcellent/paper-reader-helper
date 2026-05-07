import type { PaperBlock, PaperDetail, ReadingStatus } from '../../types'
import { PaperOverviewPanel } from '../library/PaperOverviewPanel'
import { Icon } from '../UiIcon'
import { MarkdownReaderPane } from './MarkdownReaderPane'
import { PdfReaderPane } from './PdfReaderPane'
import { ReaderBlocksPanel } from './ReaderBlocksPanel'
import { ReaderNotesPanel } from './ReaderNotesPanel'
import { ReaderToolbar } from './ReaderToolbar'
import type { ReaderBlockFilters, ReaderBlockTranslationState } from './readerBlockTypes'
import type { ReaderMode } from './readerTypes'

type ReaderShellProps = {
  paper: PaperDetail | null
  isLoading: boolean
  mode: ReaderMode
  pdfUrl: string | null
  pdfError: string
  isPdfLoading: boolean
  isParsing: boolean
  isBlocksLoading: boolean
  isBlocksRebuilding: boolean
  isSavingNotes: boolean
  isUpdatingReadingState: boolean
  blockError: string
  blockFilters: ReaderBlockFilters
  blocks: PaperBlock[]
  selectedBlockId: number | null
  translationStates: Record<number, ReaderBlockTranslationState>
  onBack: () => void
  onBlockFiltersChange: (filters: ReaderBlockFilters) => void
  onBlockForceRefreshTranslation?: (block: PaperBlock) => void
  onBlockOpenPage: (block: PaperBlock) => void
  onBlockRebuild: () => Promise<void> | void
  onBlockSelect: (block: PaperBlock) => void
  onBlockTranslate: (block: PaperBlock) => void
  onModeChange: (mode: ReaderMode) => void
  onPdfRetry: () => Promise<void> | void
  onParse: () => Promise<void> | void
  onNotesSave: (notes: string) => Promise<void> | void
  onReadingStateChange: (payload: {
    reading_status: ReadingStatus
    reading_progress: number
  }) => Promise<void> | void
}

export function ReaderShell({
  paper,
  isLoading,
  mode,
  pdfUrl,
  pdfError,
  isPdfLoading,
  isParsing,
  isBlocksLoading,
  isBlocksRebuilding,
  isSavingNotes,
  isUpdatingReadingState,
  blockError,
  blockFilters,
  blocks,
  selectedBlockId,
  translationStates,
  onBack,
  onBlockFiltersChange,
  onBlockForceRefreshTranslation,
  onBlockOpenPage,
  onBlockRebuild,
  onBlockSelect,
  onBlockTranslate,
  onModeChange,
  onPdfRetry,
  onParse,
  onNotesSave,
  onReadingStateChange,
}: ReaderShellProps) {
  if (isLoading) {
    return (
      <main className="reader-shell reader-empty-state" aria-busy="true">
        <span className="spinner" />
        <span>Loading reader...</span>
      </main>
    )
  }

  if (!paper) {
    return (
      <main className="reader-shell reader-empty-state">
        <Icon name="book" />
        <span>Select a paper to open the reader.</span>
      </main>
    )
  }

  return (
    <main className="reader-shell">
      <ReaderToolbar
        isUpdatingReadingState={isUpdatingReadingState}
        mode={mode}
        onBack={onBack}
        onModeChange={onModeChange}
        onReadingStateChange={onReadingStateChange}
        paper={paper}
      />
      <div className="reader-shell-grid">
        <div className="reader-primary-pane">
          {mode === 'pdf' ? (
            <PdfReaderPane
              errorMessage={pdfError}
              isLoading={isPdfLoading}
              onRetry={onPdfRetry}
              pdfUrl={pdfUrl}
            />
          ) : (
            <MarkdownReaderPane isParsing={isParsing} onParse={onParse} paper={paper} />
          )}
        </div>
        <aside className="reader-side-pane">
          <ReaderBlocksPanel
            blocks={blocks}
            errorMessage={blockError}
            filters={blockFilters}
            isLoading={isBlocksLoading}
            isRebuilding={isBlocksRebuilding}
            onFiltersChange={onBlockFiltersChange}
            onForceRefreshTranslation={onBlockForceRefreshTranslation}
            onOpenPage={onBlockOpenPage}
            onRebuild={onBlockRebuild}
            onSelectBlock={onBlockSelect}
            onTranslate={onBlockTranslate}
            selectedBlockId={selectedBlockId}
            translationStates={translationStates}
          />
          <PaperOverviewPanel paper={paper} />
          <ReaderNotesPanel isSaving={isSavingNotes} onSave={onNotesSave} paper={paper} />
        </aside>
      </div>
    </main>
  )
}
