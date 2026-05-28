import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AcademicTrackingPage } from '../AcademicTrackingPage'
import type { Paper } from '../../../types'
import type { StatsOverview, DailyStatsItem, SourceDistItem } from '../../../lib/api'

const dashboardMocks = vi.hoisted(() => ({
  handleRunToday: vi.fn(),
  showToast: vi.fn(),
}))

// Mock the API module
vi.mock('../../../lib/api', () => ({
  fetchStatsOverview: vi.fn(),
  fetchDailyStats: vi.fn(),
  fetchSourceDist: vi.fn(),
}))

vi.mock('../../dashboard/useDashboardData', () => ({
  useDashboardData: vi.fn(() => ({
    kpiMetrics: [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 2 }],
    automationStatus: {
      timezone: 'Asia/Shanghai',
      today_run: null,
    },
    runningToday: false,
    handleRunToday: dashboardMocks.handleRunToday,
    briefing: null,
    loading: false,
    error: null,
  })),
}))

vi.mock('../../dashboard/DailyReportDrawer', () => ({
  DailyReportDrawer: ({ open }: any) => (
    open ? <div data-testid="daily-report-drawer">DailyReportDrawer</div> : null
  ),
}))

vi.mock('../../dashboard/DashboardDialogs', () => ({
  AutomationSettingsDialog: ({ open }: any) => (
    open ? <div data-testid="automation-settings-dialog">AutomationSettingsDialog</div> : null
  ),
}))

vi.mock('../../dashboard/DashboardToast', () => ({
  DashboardToastContainer: () => <div data-testid="dashboard-toast-container" />,
  showToast: dashboardMocks.showToast,
}))

vi.mock('../TrackingDetailDrawer', () => ({
  TrackingDetailDrawer: ({ open, view }: any) => (
    open ? <div data-testid="tracking-detail-drawer" data-view={view}>TrackingDetailDrawer</div> : null
  ),
}))

// Mock child components to simplify testing and verify prop distribution
vi.mock('../TrackingTopbar', () => ({
  TrackingTopbar: ({
    searchValue,
    onSearch,
    onViewReport,
    onOpenSettings,
    onRefresh,
    onRangeChange,
  }: any) => (
    <div
      data-testid="tracking-topbar"
      data-has-search={!!onSearch}
      data-search-value={searchValue ?? ''}
    >
      TrackingTopbar
      <input
        aria-label="mock tracking search"
        value={searchValue ?? ''}
        onChange={(event) => onSearch(event.target.value)}
      />
      <button type="button" onClick={onViewReport}>mock view report</button>
      <button type="button" onClick={onOpenSettings}>mock settings</button>
      <button type="button" onClick={onRefresh}>mock refresh</button>
      <button type="button" onClick={() => onRangeChange(14)}>mock range 14</button>
    </div>
  ),
}))

vi.mock('../TrackingKpiCard', () => ({
  TrackingKpiCard: ({ label, value, note, loading, error }: any) => (
    <div data-testid={`kpi-card-${label}`} data-loading={loading} data-error={error} data-value={value}>
      <span data-testid="kpi-label">{label}</span>
      <span data-testid="kpi-value">{value}</span>
      <span data-testid="kpi-note">{note}</span>
    </div>
  ),
}))

vi.mock('../SourceDistributionCard', () => ({
  SourceDistributionCard: ({ sources, loading, onViewDetails }: any) => (
    <div data-testid="source-distribution-card" data-loading={loading} data-sources-count={sources.length}>
      SourceDistributionCard
      <button type="button" onClick={onViewDetails}>source details</button>
    </div>
  ),
}))

vi.mock('../ResearchRhythmCard', () => ({
  ResearchRhythmCard: ({ dailyData, loading }: any) => (
    <div data-testid="research-rhythm-card" data-loading={loading} data-daily-count={dailyData.length}>
      ResearchRhythmCard
    </div>
  ),
}))

vi.mock('../ImportTrendChart', () => ({
  ImportTrendChart: ({ data, loading, onViewDetails }: any) => (
    <div data-testid="import-trend-chart" data-loading={loading} data-count={data.length}>
      ImportTrendChart
      <button type="button" onClick={onViewDetails}>import details</button>
    </div>
  ),
}))

vi.mock('../CompletionTrendChart', () => ({
  CompletionTrendChart: ({ data, loading, onViewDetails }: any) => (
    <div data-testid="completion-trend-chart" data-loading={loading} data-count={data.length}>
      CompletionTrendChart
      <button type="button" onClick={onViewDetails}>completion details</button>
    </div>
  ),
}))

vi.mock('../TopicDistributionCard', () => ({
  TopicDistributionCard: ({ sources, loading, onViewAll }: any) => (
    <div data-testid="topic-distribution-card" data-loading={loading} data-sources-count={sources.length}>
      TopicDistributionCard
      <button type="button" onClick={onViewAll}>topic details</button>
    </div>
  ),
}))

vi.mock('../RecentActivitiesTable', () => ({
  RecentActivitiesTable: ({ papers, loading, onViewAll }: any) => (
    <div data-testid="recent-activities-table" data-loading={loading} data-papers-count={papers.length}>
      RecentActivitiesTable
      <button type="button" onClick={onViewAll}>activity details</button>
    </div>
  ),
}))

// Import mocked functions after vi.mock
import { fetchStatsOverview, fetchDailyStats, fetchSourceDist } from '../../../lib/api'

const mockedFetchStatsOverview = fetchStatsOverview as ReturnType<typeof vi.fn>
const mockedFetchDailyStats = fetchDailyStats as ReturnType<typeof vi.fn>
const mockedFetchSourceDist = fetchSourceDist as ReturnType<typeof vi.fn>

function renderTrackingPage(props: { papers: Paper[]; refreshLibrary?: () => Promise<void> }) {
  return render(
    <MemoryRouter>
      <AcademicTrackingPage {...props} />
    </MemoryRouter>,
  )
}

// ─── Test Data ──────────────────────────────────────────────
const mockStatsOverview: StatsOverview = {
  total: 42,
  ready: 30,
  parsed: 35,
  summarized: 28,
  pending: 5,
  processing: 2,
  completion_rate: 71.4,
}

const mockDailyStats: DailyStatsItem[] = [
  { date: '2024-01-01', count: 3 },
  { date: '2024-01-02', count: 5 },
  { date: '2024-01-03', count: 2 },
]

const mockSourceDist: SourceDistItem[] = [
  { source: 'arxiv', count: 20 },
  { source: 'ieee', count: 15 },
  { source: 'acm', count: 7 },
]

const mockPapers: Paper[] = [
  {
    id: 1,
    title: 'Vision Transformer Paper',
    source: 'arxiv',
    authors: 'Alice Chen',
    abstract_raw: 'Transformer architecture for medical image segmentation.',
    tags: ['vision', 'segmentation'],
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/path/a.pdf',
    updated_at: '2024-01-03T10:00:00Z',
  },
  {
    id: 2,
    title: 'Graph Retrieval Paper',
    source: 'ieee',
    authors: 'Bob Lin',
    abstract_raw: 'Graph retrieval baseline.',
    tags: ['retrieval'],
    status: 'queued',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/path/b.pdf',
    updated_at: '2024-01-02T09:00:00Z',
  },
  {
    id: 3,
    title: 'Clinical Parsing Paper',
    source: 'acm',
    authors: 'Carol Wang',
    abstract_raw: 'Clinical note parsing workflow.',
    tags: ['clinical'],
    status: 'parsing',
    parse_status: 'completed',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/path/c.pdf',
    updated_at: '2024-01-01T08:00:00Z',
  },
]

describe('AcademicTrackingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Successful API calls (Requirement 9.1)', () => {
    it('calls all three API functions via Promise.all on mount', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        expect(mockedFetchStatsOverview).toHaveBeenCalledTimes(1)
        expect(mockedFetchDailyStats).toHaveBeenCalledWith(7)
        expect(mockedFetchSourceDist).toHaveBeenCalledTimes(1)
      })
    })

    it('distributes API data to child components after successful load', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        // SourceDistributionCard receives sources
        const sourceCard = screen.getByTestId('source-distribution-card')
        expect(sourceCard).toHaveAttribute('data-sources-count', '3')

        // ResearchRhythmCard receives dailyData
        const rhythmCard = screen.getByTestId('research-rhythm-card')
        expect(rhythmCard).toHaveAttribute('data-daily-count', '3')

        // ImportTrendChart receives dailyData
        const importChart = screen.getByTestId('import-trend-chart')
        expect(importChart).toHaveAttribute('data-count', '3')

        // CompletionTrendChart receives dailyData
        const completionChart = screen.getByTestId('completion-trend-chart')
        expect(completionChart).toHaveAttribute('data-count', '3')

        // TopicDistributionCard receives sources
        const topicCard = screen.getByTestId('topic-distribution-card')
        expect(topicCard).toHaveAttribute('data-sources-count', '3')

        // RecentActivitiesTable receives papers
        const activitiesTable = screen.getByTestId('recent-activities-table')
        expect(activitiesTable).toHaveAttribute('data-papers-count', '3')
      })
    })

    it('renders KPI cards with correct values from API stats', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        const totalCard = screen.getByTestId('kpi-card-总文章数')
        expect(totalCard).toHaveAttribute('data-value', '42')
        expect(totalCard).toHaveAttribute('data-loading', 'false')
      })
    })
  })

  describe('Loading state (Requirement 9.3)', () => {
    it('shows loading state with skeleton KPI cards initially', () => {
      // Make API calls hang (never resolve)
      mockedFetchStatsOverview.mockReturnValue(new Promise(() => {}))
      mockedFetchDailyStats.mockReturnValue(new Promise(() => {}))
      mockedFetchSourceDist.mockReturnValue(new Promise(() => {}))

      renderTrackingPage({ papers: mockPapers })

      // During loading, KPI cards should have loading=true
      const kpiCards = screen.getAllByTestId(/^kpi-card-/)
      expect(kpiCards.length).toBe(6)
      kpiCards.forEach((card) => {
        expect(card).toHaveAttribute('data-loading', 'true')
      })
    })

    it('does not render chart/table components during loading', () => {
      mockedFetchStatsOverview.mockReturnValue(new Promise(() => {}))
      mockedFetchDailyStats.mockReturnValue(new Promise(() => {}))
      mockedFetchSourceDist.mockReturnValue(new Promise(() => {}))

      renderTrackingPage({ papers: mockPapers })

      // During loading, the full content (charts, tables) should not be rendered
      expect(screen.queryByTestId('source-distribution-card')).not.toBeInTheDocument()
      expect(screen.queryByTestId('research-rhythm-card')).not.toBeInTheDocument()
      expect(screen.queryByTestId('import-trend-chart')).not.toBeInTheDocument()
      expect(screen.queryByTestId('recent-activities-table')).not.toBeInTheDocument()
    })

    it('renders TrackingTopbar during loading', () => {
      mockedFetchStatsOverview.mockReturnValue(new Promise(() => {}))
      mockedFetchDailyStats.mockReturnValue(new Promise(() => {}))
      mockedFetchSourceDist.mockReturnValue(new Promise(() => {}))

      renderTrackingPage({ papers: mockPapers })

      expect(screen.getByTestId('tracking-topbar')).toBeInTheDocument()
    })
  })

  describe('Fallback logic when API fails (Requirements 9.4, 9.5)', () => {
    it('computes stats from local papers when API fails', async () => {
      mockedFetchStatsOverview.mockRejectedValue(new Error('Network error'))
      mockedFetchDailyStats.mockRejectedValue(new Error('Network error'))
      mockedFetchSourceDist.mockRejectedValue(new Error('Network error'))

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        // total = 3 papers
        const totalCard = screen.getByTestId('kpi-card-总文章数')
        expect(totalCard).toHaveAttribute('data-value', '3')

        // ready = 1 (Paper A has status 'ready')
        // completion_rate = Math.round((1/3) * 100) = 33 => "33.0%"
        const completionCard = screen.getByTestId('kpi-card-处理完成率')
        expect(completionCard).toHaveAttribute('data-value', '33.0%')

        // parsed = 2 (Paper A and C have parse_status 'completed')
        const parsedCard = screen.getByTestId('kpi-card-结构提取')
        expect(parsedCard).toHaveAttribute('data-value', '2')

        // summarized = 1 (Paper A has summary_status 'completed')
        const summarizedCard = screen.getByTestId('kpi-card-摘要生成')
        expect(summarizedCard).toHaveAttribute('data-value', '1')

        // pending = 1 (Paper B has status 'queued')
        const pendingCard = screen.getByTestId('kpi-card-待处理队列')
        expect(pendingCard).toHaveAttribute('data-value', '1')

        // processing = 1 (Paper C has status 'parsing')
        const processingCard = screen.getByTestId('kpi-card-正在运行中')
        expect(processingCard).toHaveAttribute('data-value', '1')
      })
    })

    it('sets dailyData and sources to empty arrays on API failure', async () => {
      mockedFetchStatsOverview.mockRejectedValue(new Error('Network error'))
      mockedFetchDailyStats.mockRejectedValue(new Error('Network error'))
      mockedFetchSourceDist.mockRejectedValue(new Error('Network error'))

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        // SourceDistributionCard should receive empty sources
        const sourceCard = screen.getByTestId('source-distribution-card')
        expect(sourceCard).toHaveAttribute('data-sources-count', '0')

        // ResearchRhythmCard should receive empty dailyData
        const rhythmCard = screen.getByTestId('research-rhythm-card')
        expect(rhythmCard).toHaveAttribute('data-daily-count', '0')

        // ImportTrendChart should receive empty data
        const importChart = screen.getByTestId('import-trend-chart')
        expect(importChart).toHaveAttribute('data-count', '0')

        // CompletionTrendChart should receive empty data
        const completionChart = screen.getByTestId('completion-trend-chart')
        expect(completionChart).toHaveAttribute('data-count', '0')

        // TopicDistributionCard should receive empty sources
        const topicCard = screen.getByTestId('topic-distribution-card')
        expect(topicCard).toHaveAttribute('data-sources-count', '0')
      })
    })

    it('handles empty papers array gracefully on API failure', async () => {
      mockedFetchStatsOverview.mockRejectedValue(new Error('Network error'))
      mockedFetchDailyStats.mockRejectedValue(new Error('Network error'))
      mockedFetchSourceDist.mockRejectedValue(new Error('Network error'))

      renderTrackingPage({ papers: [] })

      await waitFor(() => {
        // total = 0
        const totalCard = screen.getByTestId('kpi-card-总文章数')
        expect(totalCard).toHaveAttribute('data-value', '0')

        // completion_rate = 0 (total is 0, so rate is 0)
        const completionCard = screen.getByTestId('kpi-card-处理完成率')
        expect(completionCard).toHaveAttribute('data-value', '0.0%')
      })
    })
  })

  describe('Search filtering', () => {
    it('filters tracking widgets by title search and recomputes KPI values', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '3')
      })

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: 'vision' },
      })

      await waitFor(() => {
        expect(screen.getByTestId('kpi-card-总文章数')).toHaveAttribute('data-value', '1')
        expect(screen.getByTestId('kpi-card-处理完成率')).toHaveAttribute('data-value', '100.0%')
        expect(screen.getByTestId('source-distribution-card')).toHaveAttribute('data-sources-count', '1')
        expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '1')
      })
    })

    it('searches across authors, abstract, source, status, and tags', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '3')
      })

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: 'bob' },
      })
      expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '1')

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: 'clinical' },
      })
      expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '1')

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: 'queued' },
      })
      expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '1')
    })

    it('shows zeroed widgets when search has no matches and restores API data when cleared', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        expect(screen.getByTestId('kpi-card-总文章数')).toHaveAttribute('data-value', '42')
      })

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: 'no-match-keyword' },
      })

      await waitFor(() => {
        expect(screen.getByTestId('kpi-card-总文章数')).toHaveAttribute('data-value', '0')
        expect(screen.getByTestId('source-distribution-card')).toHaveAttribute('data-sources-count', '0')
        expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '0')
      })

      fireEvent.change(screen.getByLabelText('mock tracking search'), {
        target: { value: '' },
      })

      await waitFor(() => {
        expect(screen.getByTestId('kpi-card-总文章数')).toHaveAttribute('data-value', '42')
        expect(screen.getByTestId('source-distribution-card')).toHaveAttribute('data-sources-count', '3')
        expect(screen.getByTestId('recent-activities-table')).toHaveAttribute('data-papers-count', '3')
      })
    })
  })

  describe('Interactive controls', () => {
    it('wires topbar report viewing, settings, refresh, and range actions', async () => {
      const refreshLibrary = vi.fn().mockResolvedValue(undefined)
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers, refreshLibrary })

      await waitFor(() => {
        expect(screen.getByTestId('recent-activities-table')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('mock view report'))
      expect(screen.getByTestId('daily-report-drawer')).toBeInTheDocument()

      fireEvent.click(screen.getByText('mock settings'))
      expect(screen.getByTestId('automation-settings-dialog')).toBeInTheDocument()

      fireEvent.click(screen.getByText('mock refresh'))
      await waitFor(() => {
        expect(refreshLibrary).toHaveBeenCalledTimes(1)
        expect(mockedFetchStatsOverview).toHaveBeenCalledTimes(2)
      })

      fireEvent.click(screen.getByText('mock range 14'))
      await waitFor(() => {
        expect(mockedFetchDailyStats).toHaveBeenLastCalledWith(14)
      })
    })

    it('opens the matching detail drawer from each tracking card action', async () => {
      mockedFetchStatsOverview.mockResolvedValue(mockStatsOverview)
      mockedFetchDailyStats.mockResolvedValue(mockDailyStats)
      mockedFetchSourceDist.mockResolvedValue(mockSourceDist)

      renderTrackingPage({ papers: mockPapers })

      await waitFor(() => {
        expect(screen.getByTestId('recent-activities-table')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('source details'))
      expect(screen.getByTestId('tracking-detail-drawer')).toHaveAttribute('data-view', 'sources')

      fireEvent.click(screen.getByText('import details'))
      expect(screen.getByTestId('tracking-detail-drawer')).toHaveAttribute('data-view', 'imports')

      fireEvent.click(screen.getByText('completion details'))
      expect(screen.getByTestId('tracking-detail-drawer')).toHaveAttribute('data-view', 'completion')

      fireEvent.click(screen.getByText('topic details'))
      expect(screen.getByTestId('tracking-detail-drawer')).toHaveAttribute('data-view', 'topics')

      fireEvent.click(screen.getByText('activity details'))
      expect(screen.getByTestId('tracking-detail-drawer')).toHaveAttribute('data-view', 'activities')
    })
  })
})
