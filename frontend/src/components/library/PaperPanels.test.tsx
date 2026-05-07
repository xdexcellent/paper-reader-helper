// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { Category, PaperDetail } from '../../types'
import { PaperMetadataPanel } from './PaperMetadataPanel'
import { PaperOverviewPanel } from './PaperOverviewPanel'

const categories: Category[] = [
  {
    id: 1,
    name: 'Pending Review',
    slug: 'pending-review',
    description: 'Needs review',
    is_system: true,
    is_active: true,
    is_pending_bucket: true,
    paper_count: 1,
    pending_count: 1,
  },
  {
    id: 2,
    name: 'Deep Learning',
    slug: 'deep-learning',
    description: 'Research category',
    is_system: true,
    is_active: true,
    is_pending_bucket: false,
    paper_count: 3,
    pending_count: 0,
  },
]

const paper: PaperDetail = {
  id: 42,
  title: 'PaperQuay Inspired Library',
  source: 'manual',
  authors: 'Ada Lovelace',
  abstract_raw: 'Original abstract.',
  year: 2026,
  venue: 'ICLR',
  doi: '10.1234/example',
  url: 'https://example.com/paper',
  favorite: false,
  reading_status: 'unread',
  reading_progress: 0,
  user_notes: 'Initial note.',
  status: 'ready',
  parse_status: 'completed',
  summary_status: 'completed',
  embedding_status: 'completed',
  local_pdf_path: '/private/paper.pdf',
  primary_category_id: 2,
  category_status: 'manual_locked',
  category_confidence: 0.92,
  category_reason: 'Assigned by reviewer',
  tags: ['library', 'agent'],
  full_markdown: '# Paper',
  abstract_md: '',
  introduction_md: '',
  method_md: '',
  conclusion_md: '',
  one_line_summary: 'A library-first paper workflow.',
  core_contributions: 'Structured import and review.',
  method_summary: 'Uses existing API contracts.',
  use_cases: 'Literature screening.',
  limitations: 'Metadata schema is still limited.',
  relevance_note: 'Relevant to paper management migration.',
}

describe('paper library panels', () => {
  test('PaperMetadataPanel renders selected metadata and forwards category, tag, and reader actions', async () => {
    const onCategoryChange = vi.fn().mockResolvedValue(undefined)
    const onTagsChange = vi.fn().mockResolvedValue(undefined)
    const onOpenReader = vi.fn()
    const onMetadataSave = vi.fn().mockResolvedValue(undefined)
    const onFavoriteChange = vi.fn().mockResolvedValue(undefined)
    const onReadingStateChange = vi.fn().mockResolvedValue(undefined)
    const onNotesSave = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperMetadataPanel
        categories={categories}
        isLoading={false}
        isUpdatingCategory={false}
        onCategoryChange={onCategoryChange}
        onFavoriteChange={onFavoriteChange}
        onMetadataSave={onMetadataSave}
        onOpenReader={onOpenReader}
        onNotesSave={onNotesSave}
        onReadingStateChange={onReadingStateChange}
        onTagsChange={onTagsChange}
        paper={paper}
      />,
    )

    expect(screen.getByRole('heading', { name: 'PaperQuay Inspired Library' })).toBeInTheDocument()
    expect(screen.getByText('manual')).toBeInTheDocument()
    expect(screen.getByText('Assigned by reviewer')).toBeInTheDocument()
    expect(screen.queryByText('/private/paper.pdf')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Primary category'), { target: { value: '1' } })
    expect(onCategoryChange).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: 'Open reader' }))
    expect(onOpenReader).toHaveBeenCalledWith(paper)

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'workflow' } })
    fireEvent.keyDown(screen.getByLabelText('New tag'), { key: 'Enter' })

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(['library', 'agent', 'workflow'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag library' }))
    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(['agent', 'workflow'])
    })
  })

  test('PaperMetadataPanel saves editable metadata payloads', async () => {
    const onMetadataSave = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperMetadataPanel
        categories={categories}
        isLoading={false}
        isUpdatingCategory={false}
        onCategoryChange={vi.fn()}
        onMetadataSave={onMetadataSave}
        paper={paper}
      />,
    )

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated title' } })
    fireEvent.change(screen.getByLabelText('Authors'), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } })
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'NeurIPS' } })
    fireEvent.change(screen.getByLabelText('DOI'), { target: { value: '10.5678/updated' } })
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/updated' } })
    fireEvent.change(screen.getByLabelText('Abstract'), { target: { value: 'Updated abstract.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }))

    await waitFor(() => {
      expect(onMetadataSave).toHaveBeenCalledWith({
        title: 'Updated title',
        authors: 'Grace Hopper',
        year: 2025,
        venue: 'NeurIPS',
        doi: '10.5678/updated',
        url: 'https://example.com/updated',
        abstract_raw: 'Updated abstract.',
      })
    })
  })

  test('PaperMetadataPanel updates favorite and reading state', async () => {
    const onFavoriteChange = vi.fn().mockResolvedValue(undefined)
    const onReadingStateChange = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperMetadataPanel
        categories={categories}
        isLoading={false}
        isUpdatingCategory={false}
        onCategoryChange={vi.fn()}
        onFavoriteChange={onFavoriteChange}
        onReadingStateChange={onReadingStateChange}
        paper={paper}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Favorite paper' }))
    await waitFor(() => expect(onFavoriteChange).toHaveBeenCalledWith(true))

    fireEvent.change(screen.getByLabelText('Reading status'), { target: { value: 'reading' } })
    fireEvent.change(screen.getByLabelText('Reading progress'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save reading state' }))

    await waitFor(() => {
      expect(onReadingStateChange).toHaveBeenCalledWith({
        reading_status: 'reading',
        reading_progress: 45,
      })
    })
  })

  test('PaperMetadataPanel saves notes and preserves text on failure', async () => {
    const onNotesSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)

    render(
      <PaperMetadataPanel
        categories={categories}
        isLoading={false}
        isUpdatingCategory={false}
        onCategoryChange={vi.fn()}
        onNotesSave={onNotesSave}
        paper={paper}
      />,
    )

    fireEvent.change(screen.getByLabelText('User notes'), { target: { value: 'Unsaved local note.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }))

    await waitFor(() => expect(screen.getByText('Notes save failed')).toBeInTheDocument())
    expect(screen.getByLabelText('User notes')).toHaveValue('Unsaved local note.')

    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }))
    await waitFor(() => expect(onNotesSave).toHaveBeenLastCalledWith('Unsaved local note.'))
  })

  test('PaperMetadataPanel exposes loading and empty states', () => {
    const { rerender } = render(
      <PaperMetadataPanel
        categories={categories}
        isLoading
        isUpdatingCategory={false}
        onCategoryChange={vi.fn()}
        paper={null}
      />,
    )

    expect(screen.getByText('Loading paper metadata...')).toBeInTheDocument()

    rerender(
      <PaperMetadataPanel
        categories={categories}
        isLoading={false}
        isUpdatingCategory={false}
        onCategoryChange={vi.fn()}
        paper={null}
      />,
    )

    expect(screen.getByText('Select a paper to inspect metadata.')).toBeInTheDocument()
  })

  test('PaperOverviewPanel maps existing summary fields into overview sections', () => {
    render(<PaperOverviewPanel paper={paper} />)

    expect(screen.getByRole('heading', { name: 'Paper overview' })).toBeInTheDocument()
    expect(screen.getByText('Quick conclusion')).toBeInTheDocument()
    expect(screen.getByText('A library-first paper workflow.')).toBeInTheDocument()
    expect(screen.getByText('Core contributions')).toBeInTheDocument()
    expect(screen.getByText('Structured import and review.')).toBeInTheDocument()
    expect(screen.getByText('Use cases')).toBeInTheDocument()
    expect(screen.getByText('Literature screening.')).toBeInTheDocument()
  })

  test('PaperOverviewPanel shows a retryable summary prompt when overview fields are empty', () => {
    render(<PaperOverviewPanel paper={{ ...paper, one_line_summary: '', core_contributions: '', method_summary: '', use_cases: '', limitations: '', relevance_note: '' }} />)

    expect(screen.getByText('No overview yet. Generate a summary to populate these sections.')).toBeInTheDocument()
  })
})
