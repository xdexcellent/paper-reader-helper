import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkDashboardPage } from '../WorkDashboardPage'
import { PaperSummarySection } from '../PaperSummarySection'
import { DashboardTopbar } from '../DashboardTopbar'
import { DashboardSidebar } from '../DashboardSidebar'
import { buildDashboardNavigationItems, buildResearchProgress } from '../dashboardUtils'
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
    projects: [],
    failed_items: [],
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
