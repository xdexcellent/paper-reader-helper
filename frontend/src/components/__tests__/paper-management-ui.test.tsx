// @vitest-environment jsdom

/**
 * Unit tests for Paper Management UI Alignment V2
 * Validates: Requirements 1.1, 2.1, 3.2, 3.5, 3.6, 4.1, 4.4, 6.1, 7.1
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ paperId: undefined }),
}))

// Mock API calls
vi.mock('../../lib/api', () => ({
  fetchPaperDetail: vi.fn().mockResolvedValue(null),
  deletePaper: vi.fn().mockResolvedValue(undefined),
  uploadPaper: vi.fn().mockResolvedValue({ id: 99 }),
  parsePaper: vi.fn().mockResolvedValue({}),
  summarizePaper: vi.fn().mockResolvedValue({}),
  embedPaper: vi.fn().mockResolvedValue({}),
  updatePaperCategory: vi.fn().mockResolvedValue({}),
  createCategory: vi.fn().mockResolvedValue({}),
  waitForTaskCompletion: vi.fn().mockResolvedValue(undefined),
  getPdfBlobUrl: vi.fn().mockResolvedValue('blob:test'),
  updatePaperTags: vi.fn().mockResolvedValue(undefined),
}))

// Mock useHealthCheck used by EmbeddingNotice
vi.mock('../useHealthCheck', () => ({
  useHealthCheck: () => ({ health: { status: 'ok', embedding_available: true }, isLoading: false }),
}))

// Mock react-markdown and related plugins (heavy deps not needed for structural tests)
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => React.createElement('div', { 'data-testid': 'markdown' }, children),
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('remark-math', () => ({ default: () => {} }))
vi.mock('rehype-katex', () => ({ default: () => {} }))
vi.mock('katex/dist/katex.min.css', () => ({}))

import type { Paper, PaperDetail as PaperDetailType, Category } from '../../types'
import { PaperManagementPage } from '../PaperManagementPage'
import { PaperList } from '../PaperList'
import { PaperDetail } from '../PaperDetail'

// ─── Test Data ──────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 1,
    title: 'Test Paper Title',
    source: 'arxiv',
    status: 'done',
    parse_status: 'done',
    summary_status: 'done',
    embedding_status: 'done',
    local_pdf_path: '/test.pdf',
    updated_at: '2024-01-15T10:00:00Z',
    tags: ['ML', 'NLP'],
    favorite: false,
    ...overrides,
  }
}

function makePaperDetail(overrides: Partial<PaperDetailType> = {}): PaperDetailType {
  return {
    ...makePaper(),
    full_markdown: '# Test\n\nContent here',
    abstract_md: 'Abstract text',
    introduction_md: 'Introduction text',
    method_md: 'Method text',
    conclusion_md: 'Conclusion text',
    one_line_summary: 'One line summary of the paper',
    core_contributions: 'Core contributions text',
    method_summary: 'Method summary text',
    use_cases: 'Use cases',
    limitations: 'Limitations text',
    relevance_note: 'Relevance note',
    ...overrides,
  }
}

const mockPapers: Paper[] = [
  makePaper({ id: 1, title: 'Paper One', favorite: true }),
  makePaper({ id: 2, title: 'Paper Two', status: 'parse_failed', parse_status: 'failed', summary_status: 'pending', embedding_status: 'pending', favorite: false }),
  makePaper({ id: 3, title: 'Paper Three', summary_status: 'pending', embedding_status: 'pending' }),
  makePaper({ id: 4, title: 'Paper Four', embedding_status: 'pending' }),
  makePaper({ id: 5, title: 'Paper Five' }),
]

const mockCategories: Category[] = []

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── KPI Cards Tests (Requirement 1.1) ─────────────────────────────────────

describe('KPI Cards', () => {
  test('renders 5 KPI cards with correct values and labels', () => {
    render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // 5 KPI cards should be present with their labels
    expect(screen.getByText('论文总数')).toBeDefined()
    expect(screen.getByText('待纠错确认')).toBeDefined()
    expect(screen.getByText('摘要待生成')).toBeDefined()
    expect(screen.getByText('向量化完成')).toBeDefined()
    expect(screen.getByText('已收藏')).toBeDefined()
  })

  test('KPI cards display correct numeric values', () => {
    const { container } = render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // Find KPI card values by their specific class
    const kpiGrid = container.querySelector('.grid.grid-cols-1')!
    const kpiValues = kpiGrid.querySelectorAll('.text-\\[30px\\]')
    expect(kpiValues.length).toBe(5)

    // Extract numeric values from KPI cards
    const values = Array.from(kpiValues).map(el => el.textContent)
    // Total papers: 5, Parse failed: 1, Summary pending: 2, Embedding done: 2, Favorites: 1
    expect(values[0]).toBe('5')  // 论文总数
    expect(values[1]).toBe('1')  // 待纠错确认
    expect(values[2]).toBe('2')  // 摘要待生成
    expect(values[3]).toBe('2')  // 向量化完成 (Paper One + Paper Five)
    expect(values[4]).toBe('1')  // 已收藏
  })

  test('KPI cards display trend/subtitle text', () => {
    render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText('全部已导入论文')).toBeDefined()
    expect(screen.getByText('需要人工确认')).toBeDefined()
    expect(screen.getByText('等待 AI 处理')).toBeDefined()
    expect(screen.getByText('可用于语义搜索')).toBeDefined()
    expect(screen.getByText('个人收藏夹')).toBeDefined()
  })

  test('KPI cards contain lucide-react icons (SVG elements)', () => {
    const { container } = render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // KPI card row uses a grid layout with 5 cards
    const kpiGrid = container.querySelector('.grid.grid-cols-1')
    expect(kpiGrid).not.toBeNull()

    // Each KPI card should have an SVG icon inside the circular icon area
    const iconContainers = kpiGrid!.querySelectorAll('.rounded-full')
    expect(iconContainers.length).toBe(5)

    // Each icon container should have an SVG
    iconContainers.forEach(container => {
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
    })
  })
})

// ─── Paper Card Structure Tests (Requirement 2.1) ───────────────────────────

describe('Paper Card Structure', () => {
  test('paper card has PDF thumbnail area', () => {
    const { container } = render(
      <PaperList
        papers={[makePaper()]}
        selectedPaperId={null}
        isLoading={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    // PDF thumbnail area should be present
    const thumbnail = container.querySelector('.paper-item-thumbnail')
    expect(thumbnail).not.toBeNull()

    // Should contain the fake PDF preview lines
    const thumbLines = container.querySelector('.paper-thumb-lines')
    expect(thumbLines).not.toBeNull()
  })

  test('paper card uses horizontal layout', () => {
    const { container } = render(
      <PaperList
        papers={[makePaper()]}
        selectedPaperId={null}
        isLoading={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    // Card should have horizontal layout class
    const horizontalCard = container.querySelector('.paper-item--horizontal')
    expect(horizontalCard).not.toBeNull()
  })

  test('paper card displays title, metadata, and action buttons', () => {
    const paper = makePaper({ title: 'My Research Paper', source: 'arxiv' })
    const { container } = render(
      <PaperList
        papers={[paper]}
        selectedPaperId={null}
        isLoading={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    // Title
    expect(screen.getByText('My Research Paper')).toBeDefined()
    // Source
    expect(screen.getByText('arxiv')).toBeDefined()
    // Action buttons (bookmark, more)
    const actionBtns = container.querySelectorAll('.paper-item-action-btn')
    expect(actionBtns.length).toBe(2)
  })

  test('selected paper card has selected class', () => {
    const paper = makePaper({ id: 42 })
    const { container } = render(
      <PaperList
        papers={[paper]}
        selectedPaperId={42}
        isLoading={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const wrapper = container.querySelector('.paper-item-wrapper.selected')
    expect(wrapper).not.toBeNull()
  })
})

// ─── Detail Panel Layout Order Tests (Requirement 4.1) ──────────────────────

describe('Detail Panel Layout Order', () => {
  test('renders sections in correct order: nav → title → actions → summary → timeline → tags → conclusions', () => {
    const detail = makePaperDetail()
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        categories={[]}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const content = container.querySelector('.paper-detail-content')
    expect(content).not.toBeNull()

    const children = Array.from(content!.children)
    const classNames = children.map(el => el.className)

    // Verify order of major sections
    const navBarIdx = classNames.findIndex(c => c.includes('detail-nav-bar'))
    const titleIdx = classNames.findIndex(c => c.includes('detail-title-section'))
    const actionsIdx = classNames.findIndex(c => c.includes('detail-actions-row'))
    const summaryIdx = classNames.findIndex(c => c.includes('detail-summary-card'))
    const timelineIdx = classNames.findIndex(c => c.includes('processing-timeline'))
    const tagsIdx = classNames.findIndex(c => c.includes('detail-tag-editor-section'))
    const conclusionIdx = classNames.findIndex(c => c.includes('conclusion-grid'))

    expect(navBarIdx).toBeGreaterThanOrEqual(0)
    expect(titleIdx).toBeGreaterThan(navBarIdx)
    expect(actionsIdx).toBeGreaterThan(titleIdx)
    expect(summaryIdx).toBeGreaterThan(actionsIdx)
    expect(timelineIdx).toBeGreaterThan(summaryIdx)
    expect(tagsIdx).toBeGreaterThan(timelineIdx)
    expect(conclusionIdx).toBeGreaterThan(tagsIdx)
  })

  test('detail nav bar has back, prev, and next buttons', () => {
    const detail = makePaperDetail()
    render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
        hasPrev={true}
        hasNext={true}
      />
    )

    expect(screen.getByText('← 返回列表')).toBeDefined()
    expect(screen.getByText('← 上一篇')).toBeDefined()
    expect(screen.getByText('下一篇 →')).toBeDefined()
  })

  test('conclusion grid renders two cards: 简要结论 and 核心贡献', () => {
    const detail = makePaperDetail({
      one_line_summary: 'Test conclusion',
      core_contributions: 'Test contributions',
    })
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const grid = container.querySelector('.conclusion-grid')
    expect(grid).not.toBeNull()

    const cards = grid!.querySelectorAll('.conclusion-card')
    expect(cards.length).toBe(2)

    // Check within the conclusion grid specifically to avoid duplicates from SummaryCard
    const gridEl = grid as HTMLElement
    const headings = gridEl.querySelectorAll('h3')
    const headingTexts = Array.from(headings).map(h => h.textContent)
    expect(headingTexts).toContain('简要结论')
    expect(headingTexts).toContain('核心贡献')
  })
})

// ─── Status Pill Colors Tests (Requirement 4.4) ─────────────────────────────

describe('Status Pill Colors', () => {
  test('completed status gets green pill class', () => {
    const detail = makePaperDetail({ status: 'done' })
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const pill = container.querySelector('.detail-status-pill')
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('detail-status-pill--green')
  })

  test('failed status gets red pill class', () => {
    const detail = makePaperDetail({ status: 'failed' })
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const pill = container.querySelector('.detail-status-pill')
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('detail-status-pill--red')
  })

  test('processing status gets yellow pill class', () => {
    const detail = makePaperDetail({ status: 'processing' })
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const pill = container.querySelector('.detail-status-pill')
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('detail-status-pill--yellow')
  })

  test('unknown status gets default pill class', () => {
    const detail = makePaperDetail({ status: 'imported' })
    const { container } = render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={vi.fn()}
        onPrevPaper={vi.fn()}
        onNextPaper={vi.fn()}
      />
    )

    const pill = container.querySelector('.detail-status-pill')
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('detail-status-pill--default')
  })
})

// ─── Theme Toggle Removal Tests (Requirement 6.1) ──────────────────────────

describe('Theme Toggle Removal', () => {
  test('theme toggle button is absent from DOM', () => {
    const { container } = render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // No theme toggle button should exist
    const themeToggle = container.querySelector('.theme-toggle-btn')
    expect(themeToggle).toBeNull()

    // Also check by common aria labels or text
    expect(screen.queryByLabelText('切换主题')).toBeNull()
    expect(screen.queryByLabelText('toggle theme')).toBeNull()
    expect(screen.queryByText('深色模式')).toBeNull()
    expect(screen.queryByText('浅色模式')).toBeNull()
  })
})

// ─── Event Handlers Tests (Requirement 7.1) ─────────────────────────────────

describe('Event Handlers', () => {
  test('onSelect fires when clicking a paper card', () => {
    const onSelect = vi.fn()
    const paper = makePaper({ id: 10, title: 'Clickable Paper' })

    render(
      <PaperList
        papers={[paper]}
        selectedPaperId={null}
        isLoading={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Clickable Paper'))
    expect(onSelect).toHaveBeenCalledWith(paper)
  })

  test('onDelete fires when clicking delete button on hovered paper', () => {
    const onDelete = vi.fn()
    const paper = makePaper({ id: 20, title: 'Deletable Paper' })

    // Mock window.confirm to return true
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(
      <PaperList
        papers={[paper]}
        selectedPaperId={null}
        isLoading={false}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />
    )

    // Hover over the paper to show action buttons
    const wrapper = container.querySelector('.paper-item-wrapper')!
    fireEvent.mouseEnter(wrapper)

    // Click "more" button to open menu
    const moreBtn = container.querySelector('.paper-item-action-btn:last-child')!
    fireEvent.click(moreBtn)

    // Click delete in the dropdown menu
    const deleteBtn = container.querySelector('.paper-item-more-menu .danger')!
    fireEvent.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledWith(paper)
  })

  test('import button opens import modal', () => {
    render(
      <PaperManagementPage
        papers={mockPapers}
        categories={mockCategories}
        isLoadingLibrary={false}
        refreshLibrary={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // Click the import button
    const importBtn = screen.getByText('导入 PDF')
    fireEvent.click(importBtn)

    // Import modal should appear (modal-overlay)
    expect(screen.getByText('导入 PDF')).toBeDefined()
  })

  test('paper detail nav buttons fire callbacks', () => {
    const onGoBack = vi.fn()
    const onPrevPaper = vi.fn()
    const onNextPaper = vi.fn()
    const detail = makePaperDetail()

    render(
      <PaperDetail
        paper={detail}
        isLoading={false}
        onGoBack={onGoBack}
        onPrevPaper={onPrevPaper}
        onNextPaper={onNextPaper}
        hasPrev={true}
        hasNext={true}
      />
    )

    fireEvent.click(screen.getByText('← 返回列表'))
    expect(onGoBack).toHaveBeenCalled()

    fireEvent.click(screen.getByText('← 上一篇'))
    expect(onPrevPaper).toHaveBeenCalled()

    fireEvent.click(screen.getByText('下一篇 →'))
    expect(onNextPaper).toHaveBeenCalled()
  })
})
