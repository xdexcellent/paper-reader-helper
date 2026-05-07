import { describe, expect, test } from 'vitest'

import type { PaperBlock, PaperBlockTranslation } from '../../types'
import {
  createPdfPageHref,
  filterReaderBlocks,
  formatBlockPageLabel,
  getBlockTypeLabel,
  getTranslationViewState,
  truncateBlockText,
} from './readerBlockUtils'

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

describe('reader block utilities', () => {
  test('formats block labels, page labels, and PDF page hrefs', () => {
    expect(getBlockTypeLabel('table')).toBe('Table')
    expect(getBlockTypeLabel('custom_type')).toBe('Custom type')
    expect(formatBlockPageLabel(0)).toBe('Page 1')
    expect(formatBlockPageLabel(null)).toBe('Page unknown')
    expect(createPdfPageHref(2)).toBe('#page=3')
    expect(createPdfPageHref(null)).toBe('#')
  })

  test('filters blocks by page, type, and search text', () => {
    const blocks = [
      block({ id: 1, page_index: 0, block_type: 'text', text: 'Retrieval augmented generation' }),
      block({ id: 2, page_index: 1, block_type: 'table', text: 'Ablation metrics' }),
      block({ id: 3, page_index: 1, block_type: 'formula', text: 'loss = x' }),
    ]

    expect(filterReaderBlocks(blocks, { page: '1', type: 'table', search: 'metric' }).map((item) => item.id)).toEqual([2])
    expect(filterReaderBlocks(blocks, { page: 'all', type: 'all', search: 'generation' }).map((item) => item.id)).toEqual([1])
    expect(filterReaderBlocks(blocks, { page: 'all', type: 'formula', search: '' }).map((item) => item.id)).toEqual([3])
  })

  test('truncates long block text without changing short text', () => {
    expect(truncateBlockText('short text', 20)).toBe('short text')
    expect(truncateBlockText('alpha beta gamma delta', 15)).toBe('alpha beta...')
  })

  test('derives translation states including stale cached translations', () => {
    expect(getTranslationViewState(block(), { isLoading: true }).label).toBe('Translating')
    expect(getTranslationViewState(block(), { errorMessage: 'model failed' }).label).toBe('Translation failed')
    expect(getTranslationViewState(block(), { translation: translation() }).label).toBe('Translated')
    expect(getTranslationViewState(block(), { translation: translation({ source_hash: 'old-hash' }) }).label).toBe('Stale translation')
  })
})
