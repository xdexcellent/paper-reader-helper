// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { PaperBlock, PaperDetail } from '../../types'
import { PdfReaderPane } from './PdfReaderPane'
import { ReaderNotesPanel } from './ReaderNotesPanel'
import { ReaderShell } from './ReaderShell'
import { ReaderToolbar } from './ReaderToolbar'

const paper: PaperDetail = {
  id: 1,
  title: 'Reader Paper',
  source: 'manual',
  authors: 'Ada Lovelace',
  abstract_raw: 'Abstract',
  year: 2026,
  venue: 'ICLR',
  doi: '10.1234/example',
  url: 'https://example.com/paper',
  favorite: false,
  reading_status: 'unread',
  reading_progress: 0,
  user_notes: 'Initial reader note.',
  status: 'ready',
  parse_status: 'completed',
  summary_status: 'completed',
  embedding_status: 'pending',
  local_pdf_path: '/private/reader.pdf',
  tags: [],
  full_markdown: '# Reader Paper\n\nBody',
  abstract_md: '',
  introduction_md: '',
  method_md: '',
  conclusion_md: '',
  one_line_summary: 'One line',
  core_contributions: 'Contrib',
  method_summary: 'Method',
  use_cases: '',
  limitations: '',
  relevance_note: '',
}

const block: PaperBlock = {
  id: 10,
  paper_id: 1,
  page_index: 1,
  block_index: 0,
  block_type: 'text',
  text: 'Shell block text',
  bbox: [10, 20, 30, 40],
  source_hash: 'hash-10',
}

function blockShellProps(overrides = {}) {
  return {
    blockError: '',
    blockFilters: { page: 'all', type: 'all', search: '' },
    blocks: [],
    isBlocksLoading: false,
    isBlocksRebuilding: false,
    onBlockFiltersChange: vi.fn(),
    onBlockForceRefreshTranslation: vi.fn(),
    onBlockOpenPage: vi.fn(),
    onBlockRebuild: vi.fn(),
    onBlockSelect: vi.fn(),
    onBlockTranslate: vi.fn(),
    selectedBlockId: null,
    translationStates: {},
    ...overrides,
  }
}

describe('reader components', () => {
  test('PdfReaderPane shows retryable PDF failures without local paths', () => {
    const onRetry = vi.fn()

    render(<PdfReaderPane errorMessage="Blob failed" isLoading={false} onRetry={onRetry} pdfUrl={null} />)

    expect(screen.getByText('PDF failed to load')).toBeInTheDocument()
    expect(screen.getByText('Blob failed')).toBeInTheDocument()
    expect(screen.queryByText('/private/reader.pdf')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry PDF' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('ReaderNotesPanel preserves local text after save failure', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline'))

    render(<ReaderNotesPanel isSaving={false} onSave={onSave} paper={paper} />)

    fireEvent.change(screen.getByLabelText('阅读笔记'), { target: { value: 'Unsaved reader note.' } })

    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))

    await waitFor(() => expect(screen.getByText('笔记保存失败')).toBeInTheDocument())

    expect(screen.getByLabelText('阅读笔记')).toHaveValue('Unsaved reader note.')
  })

  test('ReaderToolbar switches modes and saves reading state', async () => {
    const onModeChange = vi.fn()
    const onReadingStateChange = vi.fn().mockResolvedValue(undefined)

    render(
      <ReaderToolbar
        isUpdatingReadingState={false}
        mode="pdf"
        onBack={vi.fn()}
        onModeChange={onModeChange}
        onReadingStateChange={onReadingStateChange}
        paper={paper}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Markdown mode' }))
    expect(onModeChange).toHaveBeenCalledWith('markdown')

    fireEvent.change(screen.getByLabelText('阅读状态'), { target: { value: 'reading' } })

    fireEvent.change(screen.getByLabelText('阅读进度'), { target: { value: '40' } })

    fireEvent.click(screen.getByRole('button', { name: '保存阅读状态' }))

    await waitFor(() => expect(onReadingStateChange).toHaveBeenCalledWith({
      reading_status: 'reading',
      reading_progress: 40,
    }))
  })

  test('ReaderShell exposes loading and empty states', () => {
    const callbacks = {
      onBack: vi.fn(),
      onModeChange: vi.fn(),
      onNotesSave: vi.fn(),
      onParse: vi.fn(),
      onPdfRetry: vi.fn(),
      onReadingStateChange: vi.fn(),
    }
    const { rerender } = render(
      <ReaderShell
        isLoading
        isParsing={false}
        isPdfLoading={false}
        isSavingNotes={false}
        isUpdatingReadingState={false}
        mode="markdown"
        paper={null}
        pdfError=""
        pdfUrl={null}
        {...blockShellProps()}
        {...callbacks}
      />,
    )

    expect(screen.getByText('Loading reader...')).toBeInTheDocument()

    rerender(
      <ReaderShell
        isLoading={false}
        isParsing={false}
        isPdfLoading={false}
        isSavingNotes={false}
        isUpdatingReadingState={false}
        mode="markdown"
        paper={null}
        pdfError=""
        pdfUrl={null}
        {...blockShellProps()}
        {...callbacks}
      />,
    )

    expect(screen.getByText('Select a paper to open the reader.')).toBeInTheDocument()
  })

  test('ReaderShell renders block surface and delegates block actions', () => {
    const onBlockOpenPage = vi.fn()
    const onBlockTranslate = vi.fn()

    render(
      <ReaderShell
        isLoading={false}
        isParsing={false}
        isPdfLoading={false}
        isSavingNotes={false}
        isUpdatingReadingState={false}
        mode="markdown"
        onBack={vi.fn()}
        onModeChange={vi.fn()}
        onNotesSave={vi.fn()}
        onParse={vi.fn()}
        onPdfRetry={vi.fn()}
        onReadingStateChange={vi.fn()}
        paper={paper}
        pdfError=""
        pdfUrl={null}
        {...blockShellProps({ blocks: [block], onBlockOpenPage, onBlockTranslate })}
      />,
    )

    expect(screen.getByText('Shell block text')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Page 2' }))
    fireEvent.click(screen.getByRole('button', { name: '翻译段落' }))

    expect(onBlockOpenPage).toHaveBeenCalledWith(block)
    expect(onBlockTranslate).toHaveBeenCalledWith(block)
  })
})
