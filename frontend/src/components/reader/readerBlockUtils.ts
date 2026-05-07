import type { PaperBlock } from '../../types'
import type {
  ReaderBlockFilters,
  ReaderBlockTranslationState,
  ReaderBlockTranslationView,
} from './readerBlockTypes'

const blockTypeLabels: Record<string, string> = {
  chart: 'Chart',
  code: 'Code',
  formula: 'Formula',
  image: 'Image',
  list: 'List',
  table: 'Table',
  text: 'Text',
  title: 'Title',
  unknown: 'Unknown',
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (match) => match.toUpperCase())
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function getBlockTypeLabel(blockType: string): string {
  return blockTypeLabels[blockType] ?? titleCase(blockType || 'unknown')
}

export function formatBlockPageLabel(pageIndex: number | null | undefined): string {
  return typeof pageIndex === 'number' && Number.isFinite(pageIndex)
    ? `Page ${pageIndex + 1}`
    : 'Page unknown'
}

export function createPdfPageHref(pageIndex: number | null | undefined): string {
  return typeof pageIndex === 'number' && Number.isFinite(pageIndex)
    ? `#page=${pageIndex + 1}`
    : '#'
}

export function truncateBlockText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized

  const limit = Math.max(1, maxLength - 3)
  const clipped = normalized.slice(0, limit).trimEnd()
  const lastSpace = clipped.lastIndexOf(' ')
  const safeText = lastSpace > 4 ? clipped.slice(0, lastSpace) : clipped
  return `${safeText}...`
}

export function filterReaderBlocks(blocks: PaperBlock[], filters: ReaderBlockFilters): PaperBlock[] {
  const search = normalizeSearch(filters.search)
  return blocks.filter((block) => {
    const pageMatches = filters.page === 'all' || String(block.page_index) === filters.page
    const typeMatches = filters.type === 'all' || block.block_type === filters.type
    const searchMatches = !search || block.text.toLowerCase().includes(search)
    return pageMatches && typeMatches && searchMatches
  })
}

export function getTranslationViewState(
  block: PaperBlock,
  state: ReaderBlockTranslationState = {},
): ReaderBlockTranslationView {
  if (state.isLoading) {
    return { label: 'Translating', tone: 'loading', isStale: false }
  }
  if (state.errorMessage || state.translation?.status === 'failed') {
    return { label: 'Translation failed', tone: 'error', isStale: false }
  }
  if (!state.translation) {
    return { label: 'Not translated', tone: 'idle', isStale: false }
  }

  const isStale = state.translation.source_hash !== block.source_hash
  return {
    label: isStale ? 'Stale translation' : 'Translated',
    tone: isStale ? 'warning' : 'success',
    isStale,
  }
}
