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

    expect(screen.getByRole('button', { name: '全部论文 2' })).toHaveAttribute('aria-pressed', 'true')
    // Personal has 0 pending, so no pending label
    expect(screen.getByRole('button', { name: 'Personal 1 篇论文' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Deep Learning/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('分类范围'), { target: { value: 'system' } })
    expect(onCategoryScopeChange).toHaveBeenCalledWith('system')

    fireEvent.click(screen.getByRole('button', { name: 'Personal 1 篇论文' }))
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

    expect(screen.getByText('2 篇论文')).toBeInTheDocument()
    expect(screen.getByText('1 篇待确认')).toBeInTheDocument()
    expect(screen.getByText('1 篇解析失败')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '导入 PDF' }))
    fireEvent.click(screen.getByRole('button', { name: '新建分类' }))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    // Open "更多操作" dropdown and click retry
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByText('重试解析失败'))
    // Re-open dropdown (closed by the first click) and click delete
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByText('删除失败记录'))

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

    fireEvent.change(screen.getByLabelText('搜索论文'), { target: { value: 'failure' } })
    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'parse_failed' } })
    fireEvent.change(screen.getByLabelText('收藏筛选'), { target: { value: 'favorites' } })
    fireEvent.change(screen.getByLabelText('阅读筛选'), { target: { value: 'read' } })
    fireEvent.click(screen.getByRole('button', { name: '清除标签筛选 RAG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agentic Retrieval arxiv ready Agent RAG' }))
    fireEvent.click(screen.getByRole('button', { name: '删除 Agentic Retrieval' }))

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

    expect(screen.getByText('阅读中 35%')).toBeInTheDocument()
    expect(screen.getByText('已读 100%')).toBeInTheDocument()
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
