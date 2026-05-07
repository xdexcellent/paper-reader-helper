import { useState, type ReactNode } from 'react'
import type { PaperBlock, PaperDetail } from '../../types'
import { PaperOverviewPanel } from '../library/PaperOverviewPanel'
import { Drawer } from '../Drawer'
import type { DrawerTab } from '../Drawer'
import { ReaderBlocksPanel } from './ReaderBlocksPanel'
import { ReaderNotesPanel } from './ReaderNotesPanel'
import type { ReaderBlockFilters, ReaderBlockTranslationState } from './readerBlockTypes'

type RightDrawerProps = {
  isOpen: boolean
  onClose: () => void
  paper: PaperDetail | null
  isSavingNotes: boolean
  blocks: PaperBlock[]
  blockFilters: ReaderBlockFilters
  selectedBlockId: number | null
  translationStates: Record<number, ReaderBlockTranslationState>
  blockError: string
  isBlocksLoading: boolean
  isBlocksRebuilding: boolean
  onNotesSave: (notes: string) => Promise<void> | void
  onBlockFiltersChange: (filters: ReaderBlockFilters) => void
  onBlockForceRefreshTranslation?: (block: PaperBlock) => void
  onBlockOpenPage: (block: PaperBlock) => void
  onBlockRebuild: () => Promise<void> | void
  onBlockSelect: (block: PaperBlock) => void
  onBlockTranslate: (block: PaperBlock) => void
}

const READER_TABS: DrawerTab[] = [
  { key: 'overview', label: '论文概览' },
  { key: 'blocks', label: '结构块' },
  { key: 'notes', label: '笔记' },
]

export function RightDrawer({
  isOpen,
  onClose,
  paper,
  isSavingNotes,
  blocks,
  blockFilters,
  selectedBlockId,
  translationStates,
  blockError,
  isBlocksLoading,
  isBlocksRebuilding,
  onNotesSave,
  onBlockFiltersChange,
  onBlockForceRefreshTranslation,
  onBlockOpenPage,
  onBlockRebuild,
  onBlockSelect,
  onBlockTranslate,
}: RightDrawerProps) {
  const [activeTab, setActiveTab] = useState('overview')

  function renderTabContent(): ReactNode {
    switch (activeTab) {
      case 'overview':
        return <PaperOverviewPanel paper={paper} singleColumn />
      case 'blocks':
        return (
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
        )
      case 'notes':
        return <ReaderNotesPanel isSaving={isSavingNotes} onSave={onNotesSave} paper={paper} />
      default:
        return null
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="AI 辅助"
      tabs={READER_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      width={380}
    >
      {renderTabContent()}
    </Drawer>
  )
}
