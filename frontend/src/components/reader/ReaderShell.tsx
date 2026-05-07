import type { PaperBlock, PaperDetail } from '../../types'
import { Icon } from '../UiIcon'
import { MarkdownReaderPane } from './MarkdownReaderPane'
import { PdfReaderPane } from './PdfReaderPane'
import { ReaderToolbar } from './ReaderToolbar'
import { RightDrawer } from './RightDrawer'
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
  blockError: string
  blockFilters: ReaderBlockFilters
  blocks: PaperBlock[]
  selectedBlockId: number | null
  translationStates: Record<number, ReaderBlockTranslationState>
  drawerOpen: boolean
  readingStatusLabel: string
  readingProgress: number
  autoSaved: boolean
  onBack: () => void
  onBlockFiltersChange: (filters: ReaderBlockFilters) => void
  onBlockForceRefreshTranslation?: (block: PaperBlock) => void
  onBlockOpenPage: (block: PaperBlock) => void
  onBlockRebuild: () => Promise<void> | void
  onBlockSelect: (block: PaperBlock) => void
  onBlockTranslate: (block: PaperBlock) => void
  onDrawerToggle: () => void
  onModeChange: (mode: ReaderMode) => void
  onPdfRetry: () => Promise<void> | void
  onParse: () => Promise<void> | void
  onNotesSave: (notes: string) => Promise<void> | void
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
  blockError,
  blockFilters,
  blocks,
  selectedBlockId,
  translationStates,
  drawerOpen,
  readingStatusLabel,
  readingProgress,
  autoSaved,
  onBack,
  onBlockFiltersChange,
  onBlockForceRefreshTranslation,
  onBlockOpenPage,
  onBlockRebuild,
  onBlockSelect,
  onBlockTranslate,
  onDrawerToggle,
  onModeChange,
  onPdfRetry,
  onParse,
  onNotesSave,
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
        autoSaved={autoSaved}
        mode={mode}
        onBack={onBack}
        onModeChange={onModeChange}
        paper={paper}
        readingProgress={readingProgress}
        readingStatusLabel={readingStatusLabel}
      />
      <div className="reader-primary-pane">
        <div className="reader-drawer-toggle-wrap">
          <button
            className={`reader-drawer-toggle${drawerOpen ? ' active' : ''}`}
            onClick={onDrawerToggle}
            title={drawerOpen ? '收起 AI 辅助' : '展开 AI 辅助'}
            type="button"
          >
            <Icon name="assistant" />
            AI 辅助
          </button>
        </div>
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
      <RightDrawer
        blockError={blockError}
        blockFilters={blockFilters}
        blocks={blocks}
        isBlocksLoading={isBlocksLoading}
        isBlocksRebuilding={isBlocksRebuilding}
        isOpen={drawerOpen}
        isSavingNotes={isSavingNotes}
        onBlockFiltersChange={onBlockFiltersChange}
        onBlockForceRefreshTranslation={onBlockForceRefreshTranslation}
        onBlockOpenPage={onBlockOpenPage}
        onBlockRebuild={onBlockRebuild}
        onBlockSelect={onBlockSelect}
        onBlockTranslate={onBlockTranslate}
        onClose={() => onDrawerToggle()}
        onNotesSave={onNotesSave}
        paper={paper}
        selectedBlockId={selectedBlockId}
        translationStates={translationStates}
      />
    </main>
  )
}
