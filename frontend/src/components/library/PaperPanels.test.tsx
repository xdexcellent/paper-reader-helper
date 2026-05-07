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

const noopAsync = vi.fn().mockResolvedValue(undefined)
const noop = vi.fn()

function metadataProps(overrides: Record<string, unknown> = {}) {
  return {
    categories,
    isLoading: false,
    isUpdatingCategory: false,
    isRunningParse: false,
    isRunningSummarize: false,
    isRunningEmbed: false,
    selectedModel: 'gpt-5.4',
    onCategoryChange: noopAsync,
    onModelChange: noop,
    onParse: noopAsync,
    onSummarize: noopAsync,
    onEmbed: noopAsync,
    onRefreshDetail: noopAsync,
    ...overrides,
  }
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
        {...metadataProps()}
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

    // Title is now in an h2
    expect(screen.getByText('PaperQuay Inspired Library')).toBeInTheDocument()
    expect(screen.getByText('manual')).toBeInTheDocument()
    expect(screen.getByText('Assigned by reviewer')).toBeInTheDocument()
    expect(screen.queryByText('/private/paper.pdf')).not.toBeInTheDocument()

    // Expand the 分类与匹配 section to access the category select
    const categorySection = screen.getByText('分类与匹配')
    fireEvent.click(categorySection)

    fireEvent.change(screen.getByLabelText('主分类'), { target: { value: '1' } })
    expect(onCategoryChange).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: '打开阅读器' }))
    expect(onOpenReader).toHaveBeenCalledWith(paper)

    fireEvent.click(screen.getByRole('button', { name: '添加标签' }))

    fireEvent.change(screen.getByLabelText('新标签'), { target: { value: 'testing' } })
    fireEvent.keyDown(screen.getByLabelText('新标签'), { key: 'Enter' })

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(['library', 'agent', 'testing'])
    })

    fireEvent.click(screen.getByRole('button', { name: '移除标签 library' }))
    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(['agent', 'testing'])
    })
  })

  test('PaperMetadataPanel saves editable metadata payloads', async () => {
    const onMetadataSave = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperMetadataPanel
        {...metadataProps()}
        onCategoryChange={vi.fn()}
        onMetadataSave={onMetadataSave}
        paper={paper}
      />,
    )

    // Expand the 基础信息 section
    fireEvent.click(screen.getByText(/基础信息/))

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated title' } })
    fireEvent.change(screen.getByLabelText('作者'), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText('年份'), { target: { value: '2025' } })
    fireEvent.change(screen.getByLabelText('期刊/会议'), { target: { value: 'NeurIPS' } })
    fireEvent.change(screen.getByLabelText('DOI'), { target: { value: '10.5678/updated' } })
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/updated' } })
    fireEvent.click(screen.getByRole('button', { name: '保存元数据' }))

    await waitFor(() => {
      expect(onMetadataSave).toHaveBeenCalledWith({
        title: 'Updated title',
        authors: 'Grace Hopper',
        year: 2025,
        venue: 'NeurIPS',
        doi: '10.5678/updated',
        url: 'https://example.com/updated',
        abstract_raw: 'Original abstract.',
      })
    })
  })

  test('PaperMetadataPanel updates favorite and reading state', async () => {
    const onFavoriteChange = vi.fn().mockResolvedValue(undefined)
    const onReadingStateChange = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperMetadataPanel
        {...metadataProps()}
        onCategoryChange={vi.fn()}
        onFavoriteChange={onFavoriteChange}
        onReadingStateChange={onReadingStateChange}
        paper={paper}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '收藏论文' }))
    await waitFor(() => expect(onFavoriteChange).toHaveBeenCalledWith(true))

    // Expand the 阅读管理 section
    fireEvent.click(screen.getByText('阅读管理'))

    fireEvent.change(screen.getByLabelText('阅读状态'), { target: { value: 'reading' } })

    fireEvent.change(screen.getByLabelText('阅读进度'), { target: { value: '45' } })

    fireEvent.click(screen.getByRole('button', { name: '保存阅读状态' }))

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
        {...metadataProps()}
        onCategoryChange={vi.fn()}
        onNotesSave={onNotesSave}
        paper={paper}
      />,
    )

    // Expand the 阅读管理 section
    fireEvent.click(screen.getByText('阅读管理'))

    fireEvent.change(screen.getByLabelText('用户笔记'), { target: { value: 'Unsaved local note.' } })

    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))

    await waitFor(() => expect(screen.getByText('笔记保存失败')).toBeInTheDocument())

    expect(screen.getByLabelText('用户笔记')).toHaveValue('Unsaved local note.')

    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))
    await waitFor(() => expect(onNotesSave).toHaveBeenLastCalledWith('Unsaved local note.'))
  })

  test('PaperMetadataPanel exposes loading and empty states', () => {
    const { rerender } = render(
      <PaperMetadataPanel
        {...metadataProps({ isLoading: true })}
        paper={null}
      />,
    )

    expect(screen.getByText('加载论文元数据...')).toBeInTheDocument()

    rerender(
      <PaperMetadataPanel
        {...metadataProps()}
        paper={null}
      />,
    )

    expect(screen.getByText('选择一篇论文查看详情和管理状态。')).toBeInTheDocument()
  })

  test('PaperOverviewPanel maps existing summary fields into overview sections', () => {
    render(<PaperOverviewPanel paper={paper} />)

    expect(screen.getByRole('heading', { name: '论文概览' })).toBeInTheDocument()
    expect(screen.getByText('简要结论')).toBeInTheDocument()
    expect(screen.getByText('A library-first paper workflow.')).toBeInTheDocument()
    expect(screen.getByText('核心贡献')).toBeInTheDocument()
    expect(screen.getByText('Structured import and review.')).toBeInTheDocument()
    expect(screen.getByText('应用场景')).toBeInTheDocument()
    expect(screen.getByText('Literature screening.')).toBeInTheDocument()
  })

  test('PaperOverviewPanel shows a retryable summary prompt when overview fields are empty', () => {
    render(<PaperOverviewPanel paper={{ ...paper, one_line_summary: '', core_contributions: '', method_summary: '', use_cases: '', limitations: '', relevance_note: '' }} />)

    expect(screen.getByText('暂无审阅概览。生成摘要后将填充这些信息。')).toBeInTheDocument()
  })
})
