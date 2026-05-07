// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { PaperDetail } from '../../types'
import { MarkdownReaderPane } from './MarkdownReaderPane'

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
  user_notes: '',
  status: 'ready',
  parse_status: 'completed',
  summary_status: 'completed',
  embedding_status: 'pending',
  local_pdf_path: '/private/reader-paper.pdf',
  tags: [],
  full_markdown: '# Reader Paper\n\n## Method\n\nBody with **bold** text.\n\n## Method\n\nMore body.',
  abstract_md: '',
  introduction_md: '',
  method_md: '',
  conclusion_md: '',
  one_line_summary: '',
  core_contributions: '',
  method_summary: '',
  use_cases: '',
  limitations: '',
  relevance_note: '',
}

describe('MarkdownReaderPane', () => {
  test('renders available markdown with table of contents links', () => {
    render(<MarkdownReaderPane isParsing={false} onParse={vi.fn()} paper={paper} />)

    expect(screen.getByRole('heading', { name: 'Reader Paper' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Table of contents' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Method' }).map((link) => link.getAttribute('href'))).toEqual([
      '#method',
      '#method-2',
    ])
    expect(screen.getByText(/Body with/)).toBeInTheDocument()
    expect(screen.queryByText('/private/reader-paper.pdf')).not.toBeInTheDocument()
  })

  test('shows parse-needed state when markdown is missing', () => {
    const onParse = vi.fn()

    render(<MarkdownReaderPane isParsing={false} onParse={onParse} paper={{ ...paper, full_markdown: '' }} />)
    expect(screen.getByText('Markdown 尚未生成')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '解析论文' }))

    expect(onParse).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('/private/reader-paper.pdf')).not.toBeInTheDocument()
  })
})
