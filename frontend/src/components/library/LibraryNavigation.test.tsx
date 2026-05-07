// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { Category, Paper } from '../../types'
import { LibrarySidebar } from './LibrarySidebar'
import { LibraryToolbar } from './LibraryToolbar'
import { PaperLibraryList } from './PaperLibraryList'

const categories: Category[] = [
  {
    id: 1,
    name: 'Pending Review',
    slug: 'pending-review',
    description: 'Needs classification',
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
    description: 'System category',
    is_system: true,
    is_active: true,
    is_pending_bucket: false,
    paper_count: 2,
    pending_count: 0,
  },
  {
    id: 3,
    name: 'Personal',
    slug: 'personal',
    description: 'Custom category',
    is_system: false,
    is_active: true,
    is_pending_bucket: false,
    paper_count: 1,
    pending_count: 0,
  },
]

const papers: Paper[] = [
  {
    id: 1,
    title: 'Agentic Retrieval',
    source: 'arxiv',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/tmp/agentic.pdf',
    primary_category_id: 2,
    favorite: true,
    reading_status: 'reading',
    reading_progress: 35,
    tags: ['Agent', 'RAG'],
  },
  {
    id: 2,
    title: 'Library Failure Modes',
    source: 'local',
    status: 'parse_failed',
    parse_status: 'failed',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/failure.pdf',
    primary_category_id: 1,
    category_status: 'pending_review',
    favorite: false,
    reading_status: 'read',
    reading_progress: 100,
    tags: ['Ops'],
  },
]

describe('library navigation components', () => {
  test('LibrarySidebar filters category scopes and forwards selection callbacks', () => {
    const onCategoryScopeChange = vi.fn()
    const onSelectCategory = vi.fn()

    render(
      <LibrarySidebar
        categories={categories}
        categoryScope="custom"
        onCategoryScopeChange={onCategoryScopeChange}
        onSelectCategory={onSelectCategory}
        papers={papers}
        selectedCategoryId={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'All papers 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Personal 1 papers 0 pending' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deep Learning 2 papers 0 pending' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Category scope'), { target: { value: 'system' } })
    expect(onCategoryScopeChange).toHaveBeenCalledWith('system')

    fireEvent.click(screen.getByRole('button', { name: 'Personal 1 papers 0 pending' }))
    expect(onSelectCategory).toHaveBeenCalledWith(3)
  })

  test('LibraryToolbar exposes library actions and parse-failure operations', () => {
    const onOpenImport = vi.fn()
    const onToggleCreateCategory = vi.fn()
    const onRefresh = vi.fn()
    const onRetryParseFailed = vi.fn()
    const onDeleteParseFailed = vi.fn()

    render(
      <LibraryToolbar
        isDeletingParseFailed={false}
        isLoadingLibrary={false}
        isRetryingParseFailed={false}
        onDeleteParseFailed={onDeleteParseFailed}
        onOpenImport={onOpenImport}
        onRefresh={onRefresh}
        onRetryParseFailed={onRetryParseFailed}
        onToggleCreateCategory={onToggleCreateCategory}
        parseFailedCount={1}
        pendingCount={1}
        totalPapers={2}
      />,
    )

    expect(screen.getByText('2 papers')).toBeInTheDocument()
    expect(screen.getByText('1 pending')).toBeInTheDocument()
    expect(screen.getByText('1 parse failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry parse failures' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete parse failures' }))

    expect(onOpenImport).toHaveBeenCalledTimes(1)
    expect(onToggleCreateCategory).toHaveBeenCalledTimes(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onRetryParseFailed).toHaveBeenCalledTimes(1)
    expect(onDeleteParseFailed).toHaveBeenCalledTimes(1)
  })

  test('PaperLibraryList filters papers and forwards select/delete callbacks', () => {
    const onSearchChange = vi.fn()
    const onStatusFilterChange = vi.fn()
    const onFavoriteFilterChange = vi.fn()
    const onReadingStatusFilterChange = vi.fn()
    const onTagChange = vi.fn()
    const onSelect = vi.fn()
    const onDelete = vi.fn()

    render(
      <PaperLibraryList
        activeTag="RAG"
        favoriteFilter="all"
        isLoading={false}
        onDelete={onDelete}
        onFavoriteFilterChange={onFavoriteFilterChange}
        onReadingStatusFilterChange={onReadingStatusFilterChange}
        onSearchChange={onSearchChange}
        onSelect={onSelect}
        onStatusFilterChange={onStatusFilterChange}
        onTagChange={onTagChange}
        papers={papers}
        readingStatusFilter="all"
        searchQuery="arxiv"
        selectedPaperId={1}
        statusFilter="ready"
      />,
    )

    expect(screen.getByRole('button', { name: 'Agentic Retrieval arxiv ready Agent RAG' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Library Failure Modes')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search papers'), { target: { value: 'failure' } })
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'parse_failed' } })
    fireEvent.change(screen.getByLabelText('Favorite filter'), { target: { value: 'favorites' } })
    fireEvent.change(screen.getByLabelText('Reading filter'), { target: { value: 'read' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter RAG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agentic Retrieval arxiv ready Agent RAG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Agentic Retrieval' }))

    expect(onSearchChange).toHaveBeenCalledWith('failure')
    expect(onStatusFilterChange).toHaveBeenCalledWith('parse_failed')
    expect(onFavoriteFilterChange).toHaveBeenCalledWith('favorites')
    expect(onReadingStatusFilterChange).toHaveBeenCalledWith('read')
    expect(onTagChange).toHaveBeenCalledWith(null)
    expect(onSelect).toHaveBeenCalledWith(papers[0])
    expect(onDelete).toHaveBeenCalledWith(papers[0])
  })

  test('PaperLibraryList shows favorite and reading-state indicators', () => {
    render(
      <PaperLibraryList
        activeTag={null}
        favoriteFilter="all"
        isLoading={false}
        onDelete={vi.fn()}
        onFavoriteFilterChange={vi.fn()}
        onReadingStatusFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onTagChange={vi.fn()}
        papers={papers}
        readingStatusFilter="all"
        searchQuery=""
        selectedPaperId={null}
        statusFilter="all"
      />,
    )

    expect(screen.getByText('Favorite')).toBeInTheDocument()
    expect(screen.getByText('Reading 35%')).toBeInTheDocument()
    expect(screen.getByText('Read 100%')).toBeInTheDocument()
  })

  test('PaperLibraryList applies favorite and reading-state filters', () => {
    const { rerender } = render(
      <PaperLibraryList
        activeTag={null}
        favoriteFilter="favorites"
        isLoading={false}
        onDelete={vi.fn()}
        onFavoriteFilterChange={vi.fn()}
        onReadingStatusFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onTagChange={vi.fn()}
        papers={papers}
        readingStatusFilter="all"
        searchQuery=""
        selectedPaperId={null}
        statusFilter="all"
      />,
    )

    expect(screen.getByText('Agentic Retrieval')).toBeInTheDocument()
    expect(screen.queryByText('Library Failure Modes')).not.toBeInTheDocument()

    rerender(
      <PaperLibraryList
        activeTag={null}
        favoriteFilter="all"
        isLoading={false}
        onDelete={vi.fn()}
        onFavoriteFilterChange={vi.fn()}
        onReadingStatusFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSelect={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onTagChange={vi.fn()}
        papers={papers}
        readingStatusFilter="read"
        searchQuery=""
        selectedPaperId={null}
        statusFilter="all"
      />,
    )

    expect(screen.queryByText('Agentic Retrieval')).not.toBeInTheDocument()
    expect(screen.getByText('Library Failure Modes')).toBeInTheDocument()
  })
})
