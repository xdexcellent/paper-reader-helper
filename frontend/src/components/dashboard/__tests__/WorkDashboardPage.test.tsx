import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkDashboardPage } from '../WorkDashboardPage'
import { PaperSummarySection } from '../PaperSummarySection'
import { DashboardTopbar } from '../DashboardTopbar'
import { DashboardSidebar } from '../DashboardSidebar'
import { PaperListItem } from '../PaperListItem'
import { PriorityPaperCard } from '../PriorityPaperCard'
import { buildDashboardNavigationItems, buildResearchProgress } from '../dashboardUtils'
import { briefingItemToPriorityCard, paperToMockPaper } from '../useDashboardData'
import type { MockPaper } from '../mockData'
import type { Paper } from '../../../types'

const apiMocks = vi.hoisted(() => ({
  fetchAutomationStatusToday: vi.fn().mockResolvedValue({
    local_today: '2026-05-11',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: null,
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  }),
  fetchBriefing: vi.fn().mockResolvedValue({
    briefing_date: '2026-05-11',
    status: 'completed',
    generated_at: '2026-05-11T18:22:00Z',
    summary_markdown: '# Test\n\nContent here',
    paper_count: 7,
    project_count: 3,
    source_count: 5,
    fallback_used: false,
    top_papers: [
      { paper_id: 1, rank: 1, score: 0.96, reason: 'High relevance', source_kind: 'arxiv', title: 'Paper 1' },
      { paper_id: 2, rank: 2, score: 0.91, reason: 'KG related', source_kind: 'acl', title: 'Paper 2' },
      { paper_id: 3, rank: 3, score: 0.87, reason: 'IR direction', source_kind: 'sigir', title: 'Paper 3' },
    ],
    projects: [
      { rank: 1, title: 'Agent Project', url: 'https://example.com/agent-project', summary: 'Useful project for agent workflows', source_kind: 'github' },
    ],
    failed_items: [
      { title: 'Failed Feed Item', source_kind: 'arxiv', reason: 'Rate limited' },
    ],
  }),
  fetchBriefingHistory: vi.fn().mockResolvedValue([]),
  fetchDailyStats: vi.fn().mockResolvedValue([
    { date: '2026-05-05', count: 1 },
    { date: '2026-05-06', count: 2 },
    { date: '2026-05-07', count: 3 },
    { date: '2026-05-08', count: 4 },
    { date: '2026-05-09', count: 5 },
    { date: '2026-05-10', count: 6 },
    { date: '2026-05-11', count: 7 },
  ]),
  runTodayBriefing: vi.fn().mockResolvedValue({ run_id: 1, status: 'queued' }),
  getPdfBlobUrl: vi.fn().mockResolvedValue('blob:dashboard-pdf'),
  updatePaperFavorite: vi.fn().mockResolvedValue({}),
  updatePaperReadingState: vi.fn().mockResolvedValue({}),
  deletePaper: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Cell: () => null,
}))

vi.mock('../../../lib/api', () => apiMocks)

const testPapers: Paper[] = [
  makePaper(1, 'Paper Alpha', 'unread', ['NLP']),
  makePaper(2, 'Paper Beta', 'unread', ['KG']),
  makePaper(3, 'Paper Gamma', 'read', ['IR']),
  makePaper(4, 'Paper Delta', 'unread', ['GNN']),
  makePaper(5, 'Paper Epsilon', 'read', ['DL']),
  makePaper(6, 'Paper Zeta', 'unread', ['MT']),
  makePaper(7, 'Paper Eta', 'read', ['RL']),
]

function makePaper(id: number, title: string, reading_status: Paper['reading_status'], tags: string[]): Paper {
  return {
    id,
    title,
    source: 'arxiv',
    status: 'active',
    parse_status: 'done',
    summary_status: 'done',
    embedding_status: 'done',
    local_pdf_path: '',
    reading_status,
    tags,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkDashboardPage papers={testPapers} />
    </MemoryRouter>,
  )
}

describe('WorkDashboardPage integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders full page without errors', () => {
    expect(() => renderPage()).not.toThrow()
  })

  it('sidebar renders dynamic navigation items', () => {
    render(
      <MemoryRouter>
        <DashboardSidebar
          navigationItems={buildDashboardNavigationItems({ papers: testPapers })}
          activeItemId=""
          researchProgress={buildResearchProgress(testPapers)}
          user={{ name: '研究者', badge: '专业版' }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('AI 研究助手')).toBeInTheDocument()
    expect(screen.getByText('学术追踪')).toBeInTheDocument()
    expect(screen.getByText('论文管理')).toBeInTheDocument()
    expect(screen.getByText('AI 智能推荐')).toBeInTheDocument()
    expect(screen.getByText('3/7 篇已读')).toBeInTheDocument()
  })

  it('KPI cards render with values from API', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Paper Alpha' })).toBeInTheDocument()
    })
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('opens modal details from dashboard KPI cards', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看论文候选详情' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '查看论文候选详情' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '论文候选详情' })).toBeInTheDocument()
    expect(within(dialog).getByText('High relevance')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '查看相关项目详情' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '相关项目详情' })).toBeInTheDocument()
    expect(within(dialog).getByText('Agent Project')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '查看订阅源详情' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '订阅源详情' })).toBeInTheDocument()
    expect(within(dialog).getByText('Failed Feed Item')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '查看风险热点详情' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '风险热点详情' })).toBeInTheDocument()
    expect(within(dialog).getByText('Rate limited')).toBeInTheDocument()
  })

  it('filter tabs display correct counts', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('全部 7')).toBeInTheDocument()
    })
    expect(screen.getByText('未读 4')).toBeInTheDocument()
    expect(screen.getByText('已读 3')).toBeInTheDocument()
  })

  it('filter interaction changes displayed papers', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('已读 3')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('已读 3'))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Paper Gamma' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Paper Epsilon' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Paper Eta' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Paper Alpha' })).not.toBeInTheDocument()
  })

  it('displays empty state when filter yields zero results', () => {
    const allReadPapers: MockPaper[] = testPapers.map((paper) => ({
      id: String(paper.id),
      title: paper.title,
      source: paper.source,
      date: '2026-05-11',
      citations: 0,
      tags: paper.tags ?? [],
      relevanceScore: 0,
      abstract: '',
      project: '',
      thumbnailUrl: '',
      isRead: true,
    }))
    render(<PaperSummarySection papers={allReadPapers} />)
    fireEvent.click(screen.getByText('未读 0'))
    expect(screen.getByText('当前筛选条件下暂无论文')).toBeInTheDocument()
  })

  it('maps paper representative images into dashboard thumbnails', () => {
    const paper = {
      ...makePaper(11, 'Visual Paper', 'unread', ['Vision']),
      representative_image_url: '/files/papers/abc/representative-images/figure.jpg',
    }

    const mapped = paperToMockPaper(paper, new Map())

    expect(mapped.thumbnailUrl).toBe('/files/papers/abc/representative-images/figure.jpg')
  })

  it('uses matched paper representative image before briefing PDF url', () => {
    const paper = {
      ...makePaper(12, 'Priority Visual Paper', 'unread', ['Vision']),
      representative_image_url: '/files/papers/def/representative-images/figure.png',
    }

    const mapped = briefingItemToPriorityCard(
      {
        paper_id: paper.id,
        rank: 1,
        score: 1,
        reason: 'High relevance',
        source_kind: 'arxiv',
        title: paper.title,
        pdf_url: 'https://example.com/paper.pdf',
      },
      '2026-05-11',
      [paper],
      1,
    )

    expect(mapped.thumbnailUrl).toBe('/files/papers/def/representative-images/figure.png')
  })

  it('previews representative image when clicking a summary thumbnail', () => {
    const onOpenPaper = vi.fn()
    const paper: MockPaper = {
      id: '42',
      title: 'Clickable Thumbnail Paper',
      source: 'arxiv',
      date: '2026-05-11',
      citations: 0,
      tags: ['Vision'],
      relevanceScore: 0.8,
      abstract: 'Paper abstract',
      project: '',
      isRead: false,
      thumbnailUrl: '/files/papers/abc/representative-images/figure.jpg',
    }

    render(<PaperListItem paper={paper} onOpenPaper={onOpenPaper} />)
    fireEvent.click(screen.getByRole('button', { name: '预览代表图：Clickable Thumbnail Paper' }))

    expect(screen.getByRole('img', { name: '代表图预览：Clickable Thumbnail Paper' })).toBeInTheDocument()
    expect(onOpenPaper).not.toHaveBeenCalled()
  })

  it('opens paper detail when clicking a summary title', () => {
    const onOpenPaper = vi.fn()
    const paper: MockPaper = {
      id: '42',
      title: 'Clickable Title Paper',
      source: 'arxiv',
      date: '2026-05-11',
      citations: 0,
      tags: ['Vision'],
      relevanceScore: 0.8,
      abstract: 'Paper abstract',
      project: '',
      isRead: false,
      thumbnailUrl: '/files/papers/abc/representative-images/figure.jpg',
    }

    render(<PaperListItem paper={paper} onOpenPaper={onOpenPaper} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Clickable Title Paper' }))

    expect(onOpenPaper).toHaveBeenCalledWith(42)
  })

  it('previews representative image when clicking a priority thumbnail', () => {
    const onRead = vi.fn()

    render(
      <PriorityPaperCard
        rank={1}
        paperId="77"
        title="Priority Thumbnail Paper"
        source="arxiv"
        date="2026-05-11"
        citations={0}
        tags={['Agent']}
        relevanceScore={0.9}
        thumbnailUrl="/files/papers/def/representative-images/figure.png"
        onRead={onRead}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '预览代表图：Priority Thumbnail Paper' }))

    expect(screen.getByRole('img', { name: '代表图预览：Priority Thumbnail Paper' })).toBeInTheDocument()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('opens paper detail when clicking a priority title without paper id', () => {
    const onRead = vi.fn()

    render(
      <PriorityPaperCard
        rank={2}
        title="Priority Thumbnail Without Id"
        source="arxiv"
        date="2026-05-11"
        citations={0}
        tags={['Agent']}
        relevanceScore={0.9}
        thumbnailUrl="/files/papers/def/representative-images/figure.png"
        onRead={onRead}
      />,
    )
    fireEvent.click(screen.getByRole('heading', { name: 'Priority Thumbnail Without Id' }))

    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('notification badge shows unread count from supplied notifications', () => {
    render(
      <DashboardTopbar
        searchPlaceholder="Search"
        unreadCount={0}
        workspace={{ label: 'Workspace', timezone: 'Asia/Shanghai' }}
        onGenerateReport={() => {}}
        onSearch={() => {}}
        notifications={[
          { id: 'n-1', title: '日报已生成', desc: '今日 7 篇候选', time: '刚刚', read: false, icon: 'report' },
          { id: 'n-2', title: '订阅源需要关注', desc: '1 个订阅源异常', time: '今日', read: false, icon: 'risk' },
          { id: 'n-3', title: '历史通知', desc: '已读', time: '昨日', read: true, icon: 'paper' },
        ]}
      />,
    )
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
