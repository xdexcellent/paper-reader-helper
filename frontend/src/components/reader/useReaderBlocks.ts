import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { fetchPaperBlocks, rebuildPaperBlocks, translatePaperBlock } from '../../lib/api'
import type { PaperBlock, PaperBlockTranslation, PaperDetail } from '../../types'
import type { ReaderBlockFilters, ReaderBlockTranslationState } from './readerBlockTypes'

const defaultBlockFilters: ReaderBlockFilters = { page: 'all', type: 'all', search: '' }

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function useBlockLoading(paper: PaperDetail | null) {
  const [blocks, setBlocks] = useState<PaperBlock[]>([])
  const [blockError, setBlockError] = useState('')
  const [isBlocksLoading, setIsBlocksLoading] = useState(false)
  const blocksRequestRef = useRef(0)

  const loadBlocks = useCallback(async (paperId: number, loading = true) => {
    const requestId = blocksRequestRef.current + 1
    blocksRequestRef.current = requestId
    if (loading) setIsBlocksLoading(true)
    setBlockError('')
    try {
      const payload = await fetchPaperBlocks(paperId)
      if (blocksRequestRef.current === requestId) setBlocks(payload.blocks)
    } catch (error) {
      if (blocksRequestRef.current === requestId) {
        setBlocks([])
        setBlockError(readError(error, 'Failed to load blocks'))
      }
    } finally {
      if (loading && blocksRequestRef.current === requestId) setIsBlocksLoading(false)
    }
  }, [])

  useEffect(() => () => {
    blocksRequestRef.current += 1
  }, [])

  useEffect(() => {
    blocksRequestRef.current += 1
    setBlocks([])
    setBlockError('')
    if (paper?.id) {
      void loadBlocks(paper.id)
    } else {
      setIsBlocksLoading(false)
    }
  }, [loadBlocks, paper?.id])

  const reloadBlocks = useCallback(async (loading = false) => {
    if (paper?.id) await loadBlocks(paper.id, loading)
  }, [loadBlocks, paper?.id])

  return { blockError, blocks, isBlocksLoading, loadBlocks, reloadBlocks, setBlockError, setBlocks }
}

function useBlockTranslation(
  paper: PaperDetail | null,
  setBlocks: Dispatch<SetStateAction<PaperBlock[]>>,
) {
  const [translationStates, setTranslationStates] = useState<Record<number, ReaderBlockTranslationState>>({})

  useEffect(() => {
    setTranslationStates({})
  }, [paper?.id])

  function applyTranslation(translation: PaperBlockTranslation) {
    setTranslationStates((current) => ({ ...current, [translation.block_id]: { translation } }))
    setBlocks((current) => current.map((block) => (
      block.id === translation.block_id ? { ...block, translation } : block
    )))
  }

  async function translateBlock(block: PaperBlock, forceRefresh = false) {
    if (!paper) return
    setTranslationStates((current) => ({ ...current, [block.id]: { ...current[block.id], errorMessage: '', isLoading: true } }))
    try {
      const payload = forceRefresh ? { target_language: 'zh-CN', force_refresh: true } : { target_language: 'zh-CN' }
      applyTranslation(await translatePaperBlock(paper.id, block.id, payload))
    } catch (error) {
      setTranslationStates((current) => ({
        ...current,
        [block.id]: { ...current[block.id], errorMessage: readError(error, 'Translation failed'), isLoading: false },
      }))
    }
  }

  return { translationStates, translateBlock }
}

type OpenPdfPage = (pageNumber: number | null) => void

export function useReaderBlocks(paper: PaperDetail | null, openPdfPage: OpenPdfPage) {
  const [blockFilters, setBlockFilters] = useState<ReaderBlockFilters>(defaultBlockFilters)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [isBlocksRebuilding, setIsBlocksRebuilding] = useState(false)
  const loader = useBlockLoading(paper)
  const translator = useBlockTranslation(paper, loader.setBlocks)

  useEffect(() => {
    setBlockFilters(defaultBlockFilters)
    setSelectedBlockId(null)
  }, [paper?.id])

  async function onBlockRebuild() {
    if (!paper) return
    setIsBlocksRebuilding(true)
    loader.setBlockError('')
    try {
      await rebuildPaperBlocks(paper.id)
      await loader.loadBlocks(paper.id, false)
    } catch (error) {
      loader.setBlockError(readError(error, 'Failed to rebuild blocks'))
    } finally {
      setIsBlocksRebuilding(false)
    }
  }

  function onBlockOpenPage(block: PaperBlock) {
    setSelectedBlockId(block.id)
    openPdfPage(typeof block.page_index === 'number' ? block.page_index + 1 : null)
  }

  return {
    blockError: loader.blockError,
    blockFilters,
    blocks: loader.blocks,
    isBlocksLoading: loader.isBlocksLoading,
    isBlocksRebuilding,
    onBlockFiltersChange: setBlockFilters,
    onBlockForceRefreshTranslation: (block: PaperBlock) => void translator.translateBlock(block, true),
    onBlockOpenPage,
    onBlockRebuild,
    onBlockSelect: (block: PaperBlock) => setSelectedBlockId(block.id),
    onBlockTranslate: (block: PaperBlock) => void translator.translateBlock(block),
    reloadBlocks: loader.reloadBlocks,
    selectedBlockId,
    translationStates: translator.translationStates,
  }
}
