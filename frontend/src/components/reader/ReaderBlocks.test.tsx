// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { PaperBlock, PaperBlockTranslation } from '../../types'
import { ReaderBlockCard } from './ReaderBlockCard'
import { ReaderBlockTranslation } from './ReaderBlockTranslation'
import { ReaderBlocksPanel } from './ReaderBlocksPanel'

function block(overrides: Partial<PaperBlock> = {}): PaperBlock {
  return {
    id: 1,
    paper_id: 1,
    page_index: 0,
    block_index: 0,
    block_type: 'text',
    text: 'Neural retrieval improves citation review.',
    bbox: [10, 20, 30, 40],
    source_hash: 'hash-a',
    ...overrides,
  }
}

function translation(overrides: Partial<PaperBlockTranslation> = {}): PaperBlockTranslation {
  return {
    id: 10,
    paper_id: 1,
    block_id: 1,
    target_language: 'zh-CN',
    model_name: 'gpt-5.4',
    prompt_version: 'block-translate-v1',
    source_hash: 'hash-a',
    translated_text: '神经检索改进引用审阅。',
    status: 'completed',
    error_message: '',
    ...overrides,
  }
}

describe('reader block components', () => {
  test('ReaderBlockCard selects blocks, opens pages, and escapes raw text', () => {
    const onOpenPage = vi.fn()
    const onSelect = vi.fn()
    const rawBlock = block({ text: '<img src=x onerror=alert(1)>Plain block text', page_index: 1 })

    render(
      <ReaderBlockCard
        block={rawBlock}
        isSelected={false}
        onOpenPage={onOpenPage}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText('<img src=x onerror=alert(1)>Plain block text')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select block 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Page 2' }))

    expect(onSelect).toHaveBeenCalledWith(rawBlock)
    expect(onOpenPage).toHaveBeenCalledWith(rawBlock)
  })

  test('ReaderBlocksPanel filters blocks and exposes empty/rebuild states', () => {
    const onFiltersChange = vi.fn()
    const onRebuild = vi.fn()
    const blocks = [
      block({ id: 1, page_index: 0, block_type: 'text', text: 'Retrieval overview' }),
      block({ id: 2, page_index: 1, block_type: 'table', text: 'Ablation metrics' }),
    ]

    const { rerender } = render(
      <ReaderBlocksPanel
        blocks={blocks}
        errorMessage=""
        filters={{ page: 'all', type: 'all', search: '' }}
        isLoading={false}
        isRebuilding={false}
        onFiltersChange={onFiltersChange}
        onOpenPage={vi.fn()}
        onRebuild={onRebuild}
        onSelectBlock={vi.fn()}
        onTranslate={vi.fn()}
        selectedBlockId={null}
        translationStates={{}}
      />,
    )

    fireEvent.change(screen.getByLabelText('Block type'), { target: { value: 'table' } })
    expect(onFiltersChange).toHaveBeenCalledWith({ page: 'all', type: 'table', search: '' })

    rerender(
      <ReaderBlocksPanel
        blocks={blocks}
        errorMessage=""
        filters={{ page: 'all', type: 'table', search: 'metrics' }}
        isLoading={false}
        isRebuilding={false}
        onFiltersChange={onFiltersChange}
        onOpenPage={vi.fn()}
        onRebuild={onRebuild}
        onSelectBlock={vi.fn()}
        onTranslate={vi.fn()}
        selectedBlockId={2}
        translationStates={{}}
      />,
    )

    expect(screen.getByText('Ablation metrics')).toBeInTheDocument()
    expect(screen.queryByText('Retrieval overview')).not.toBeInTheDocument()

    rerender(
      <ReaderBlocksPanel
        blocks={[]}
        errorMessage=""
        filters={{ page: 'all', type: 'all', search: '' }}
        isLoading={false}
        isRebuilding={false}
        onFiltersChange={onFiltersChange}
        onOpenPage={vi.fn()}
        onRebuild={onRebuild}
        onSelectBlock={vi.fn()}
        onTranslate={vi.fn()}
        selectedBlockId={null}
        translationStates={{}}
      />,
    )

    expect(screen.getByText('No structured blocks yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild blocks' }))
    expect(onRebuild).toHaveBeenCalledTimes(1)
  })

  test('ReaderBlockTranslation renders cached, loading, failed, and stale states', () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <ReaderBlockTranslation
        block={block()}
        onForceRefresh={onRetry}
        onTranslate={onRetry}
        state={{ translation: translation() }}
      />,
    )

    expect(screen.getByText('神经检索改进引用审阅。')).toBeInTheDocument()

    rerender(<ReaderBlockTranslation block={block()} onForceRefresh={onRetry} onTranslate={onRetry} state={{ isLoading: true }} />)
    expect(screen.getByText('Translating block...')).toBeInTheDocument()

    rerender(<ReaderBlockTranslation block={block()} onForceRefresh={onRetry} onTranslate={onRetry} state={{ errorMessage: 'model failed' }} />)
    expect(screen.getByText('Translation failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry translation' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(
      <ReaderBlockTranslation
        block={block()}
        onForceRefresh={onRetry}
        onTranslate={onRetry}
        state={{ translation: translation({ source_hash: 'old-hash' }) }}
      />,
    )
    expect(screen.getByText('Stale translation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh translation' }))
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  test('ReaderBlocksPanel wires translation actions through block callbacks', () => {
    const onTranslate = vi.fn()
    const sampleBlock = block({ id: 3, block_type: 'formula', text: 'loss = x' })

    render(
      <ReaderBlocksPanel
        blocks={[sampleBlock]}
        errorMessage=""
        filters={{ page: 'all', type: 'all', search: '' }}
        isLoading={false}
        isRebuilding={false}
        onFiltersChange={vi.fn()}
        onOpenPage={vi.fn()}
        onRebuild={vi.fn()}
        onSelectBlock={vi.fn()}
        onTranslate={onTranslate}
        selectedBlockId={null}
        translationStates={{}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Translate block' }))
    expect(onTranslate).toHaveBeenCalledWith(sampleBlock)
  })
})
