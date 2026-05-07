import type { PaperBlock } from '../../types'
import { Icon } from '../UiIcon'
import { ReaderBlockCard } from './ReaderBlockCard'
import { ReaderBlockTranslation } from './ReaderBlockTranslation'
import type { ReaderBlockFilters, ReaderBlockTranslationState } from './readerBlockTypes'
import { filterReaderBlocks, formatBlockPageLabel, getBlockTypeLabel } from './readerBlockUtils'

type ReaderBlocksPanelProps = {
  blocks: PaperBlock[]
  filters: ReaderBlockFilters
  selectedBlockId: number | null
  translationStates: Record<number, ReaderBlockTranslationState>
  errorMessage: string
  isLoading: boolean
  isRebuilding: boolean
  onFiltersChange: (filters: ReaderBlockFilters) => void
  onOpenPage: (block: PaperBlock) => void
  onRebuild: () => void
  onSelectBlock: (block: PaperBlock) => void
  onTranslate: (block: PaperBlock) => void
  onForceRefreshTranslation?: (block: PaperBlock) => void
}

function uniquePages(blocks: PaperBlock[]): number[] {
  const pages = blocks
    .map((block) => block.page_index)
    .filter((page): page is number => typeof page === 'number')
  return Array.from(new Set(pages)).sort((a, b) => a - b)
}

function uniqueTypes(blocks: PaperBlock[]): string[] {
  return Array.from(new Set(blocks.map((block) => block.block_type))).sort()
}

function ReaderBlocksHeader({
  shownCount,
  totalCount,
  isRebuilding,
  onRebuild,
}: {
  shownCount: number
  totalCount: number
  isRebuilding: boolean
  onRebuild: () => void
}) {
  return (
    <header className="reader-blocks-header">
      <div>
        <h2>Structured blocks</h2>
        <p>{shownCount} of {totalCount} blocks shown</p>
      </div>
      <button className="btn btn-secondary" disabled={isRebuilding} onClick={onRebuild} type="button">
        <Icon name="refresh" />
        {isRebuilding ? 'Rebuilding blocks' : 'Rebuild blocks'}
      </button>
    </header>
  )
}

function ReaderBlockFiltersForm({
  filters,
  pages,
  types,
  onFiltersChange,
}: {
  filters: ReaderBlockFilters
  pages: number[]
  types: string[]
  onFiltersChange: (filters: ReaderBlockFilters) => void
}) {
  function patchFilters(patch: Partial<ReaderBlockFilters>) {
    onFiltersChange({ ...filters, ...patch })
  }

  return (
    <div className="reader-block-filters">
      <label className="library-control" htmlFor="reader-block-search">
        <span>Block search</span>
        <input id="reader-block-search" onChange={(event) => patchFilters({ search: event.target.value })} placeholder="Search block text" type="search" value={filters.search} />
      </label>
      <label className="library-control" htmlFor="reader-block-page">
        <span>Block page</span>
        <select id="reader-block-page" onChange={(event) => patchFilters({ page: event.target.value })} value={filters.page}>
          <option value="all">All pages</option>
          {pages.map((page) => <option key={page} value={String(page)}>{formatBlockPageLabel(page)}</option>)}
        </select>
      </label>
      <label className="library-control" htmlFor="reader-block-type">
        <span>Block type</span>
        <select id="reader-block-type" onChange={(event) => patchFilters({ type: event.target.value })} value={filters.type}>
          <option value="all">All types</option>
          {types.map((type) => <option key={type} value={type}>{getBlockTypeLabel(type)}</option>)}
        </select>
      </label>
    </div>
  )
}

function ReaderBlocksState({
  isLoading,
  hasBlocks,
  hasFilteredBlocks,
}: {
  isLoading: boolean
  hasBlocks: boolean
  hasFilteredBlocks: boolean
}) {
  if (isLoading) {
    return <div className="reader-blocks-state" aria-busy="true"><span className="spinner" /><span>Loading blocks...</span></div>
  }
  if (!hasBlocks) {
    return (
      <div className="reader-blocks-state">
        <Icon name="fileText" />
        <h3>No structured blocks yet</h3>
        <p>Rebuild blocks after parsing to browse the paper by MinerU layout blocks.</p>
      </div>
    )
  }
  if (!hasFilteredBlocks) {
    return <div className="reader-blocks-state"><Icon name="search" /><h3>No blocks match filters</h3></div>
  }
  return null
}

function ReaderBlockList({
  blocks,
  selectedBlockId,
  translationStates,
  onOpenPage,
  onSelectBlock,
  onTranslate,
  onForceRefreshTranslation,
}: {
  blocks: PaperBlock[]
  selectedBlockId: number | null
  translationStates: Record<number, ReaderBlockTranslationState>
  onOpenPage: (block: PaperBlock) => void
  onSelectBlock: (block: PaperBlock) => void
  onTranslate: (block: PaperBlock) => void
  onForceRefreshTranslation?: (block: PaperBlock) => void
}) {
  return (
    <div className="reader-block-list">
      {blocks.map((block) => (
        <ReaderBlockCard block={block} isSelected={selectedBlockId === block.id} key={block.id} onOpenPage={onOpenPage} onSelect={onSelectBlock}>
          <ReaderBlockTranslation block={block} onForceRefresh={onForceRefreshTranslation} onTranslate={onTranslate} state={translationStates[block.id] ?? { translation: block.translation ?? null }} />
        </ReaderBlockCard>
      ))}
    </div>
  )
}

export function ReaderBlocksPanel({
  blocks,
  filters,
  selectedBlockId,
  translationStates,
  errorMessage,
  isLoading,
  isRebuilding,
  onFiltersChange,
  onOpenPage,
  onRebuild,
  onSelectBlock,
  onTranslate,
  onForceRefreshTranslation,
}: ReaderBlocksPanelProps) {
  const filteredBlocks = filterReaderBlocks(blocks, filters)
  return (
    <section className="reader-blocks-panel" aria-label="Structured paper blocks">
      <ReaderBlocksHeader shownCount={filteredBlocks.length} totalCount={blocks.length} isRebuilding={isRebuilding} onRebuild={onRebuild} />
      <ReaderBlockFiltersForm filters={filters} pages={uniquePages(blocks)} types={uniqueTypes(blocks)} onFiltersChange={onFiltersChange} />
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <ReaderBlocksState isLoading={isLoading} hasBlocks={blocks.length > 0} hasFilteredBlocks={filteredBlocks.length > 0} />
      {!isLoading && filteredBlocks.length > 0 && (
        <ReaderBlockList blocks={filteredBlocks} selectedBlockId={selectedBlockId} translationStates={translationStates} onForceRefreshTranslation={onForceRefreshTranslation} onOpenPage={onOpenPage} onSelectBlock={onSelectBlock} onTranslate={onTranslate} />
      )}
    </section>
  )
}
