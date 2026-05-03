// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'

import App from './App'
import { AuthProvider } from './components/AuthContext'

const apiMocks = vi.hoisted(() => ({
  UNAUTHORIZED_EVENT: 'paper-reader:unauthorized',
  checkAuthStatus: vi.fn(),
  loginApi: vi.fn(),
  fetchPapers: vi.fn(),
  fetchCategories: vi.fn(),
  fetchPaperDetail: vi.fn(),
  uploadPaper: vi.fn(),
  parsePaper: vi.fn(),
  summarizePaper: vi.fn(),
  deletePaper: vi.fn(),
  semanticSearch: vi.fn(),
  embedPaper: vi.fn(),
  waitForTaskCompletion: vi.fn(),
  createChatSession: vi.fn(),
  fetchChatSessions: vi.fn(),
  fetchChatSessionDetail: vi.fn(),
  deleteChatSession: vi.fn(),
  sendSessionMessage: vi.fn(),
  fetchStatsOverview: vi.fn(),
  fetchDailyStats: vi.fn(),
  fetchSourceDist: vi.fn(),
  fetchBriefing: vi.fn(),
  fetchBriefingHistory: vi.fn(),
  fetchAutomationSettings: vi.fn(),
  fetchAutomationStatusToday: vi.fn(),
  updateAutomationSettings: vi.fn(),
  runTodayBriefing: vi.fn(),
  fetchRecommendations: vi.fn(),
  getPdfBlobUrl: vi.fn(),
  updatePaperTags: vi.fn(),
  updatePaperCategory: vi.fn(),
  createCategory: vi.fn(),
  importPaperFromUrl: vi.fn(),
}))

vi.mock('./lib/api', () => apiMocks)

beforeEach(() => {
  Object.values(apiMocks).forEach(mock => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset()
    }
  })
  apiMocks.checkAuthStatus.mockResolvedValue({ requires_password: false })
  apiMocks.fetchPapers.mockResolvedValue([])
  apiMocks.fetchCategories.mockResolvedValue([
    {
      id: 1,
      name: '待确认',
      slug: '待确认',
      description: 'Needs manual review',
      is_system: true,
      is_active: true,
      is_pending_bucket: true,
      paper_count: 0,
      pending_count: 0,
    },
  ])
  apiMocks.semanticSearch.mockResolvedValue([])
  apiMocks.fetchChatSessions.mockResolvedValue([])
  apiMocks.createChatSession.mockResolvedValue({
    id: 1,
    title: '新对话',
    paper_id: null,
    model: 'gpt-5.4-mini',
    created_at: '2026-04-15T00:00:00Z',
    updated_at: '2026-04-15T00:00:00Z',
  })
  apiMocks.fetchBriefing.mockRejectedValue(new Error('briefing unavailable'))
  apiMocks.fetchAutomationSettings.mockResolvedValue({
    enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.fetchAutomationStatusToday.mockResolvedValue({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefingHistory.mockResolvedValue([])
  apiMocks.updateAutomationSettings.mockResolvedValue({
    enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.runTodayBriefing.mockResolvedValue({ run_id: 1, status: 'completed' })
  apiMocks.fetchStatsOverview.mockRejectedValue(new Error('stats unavailable'))
  apiMocks.fetchDailyStats.mockResolvedValue([])
  apiMocks.fetchSourceDist.mockResolvedValue([])
  apiMocks.fetchRecommendations.mockRejectedValue(new Error('recommendations unavailable'))
  apiMocks.embedPaper.mockResolvedValue({ task_id: '', message: 'ok' })
  apiMocks.waitForTaskCompletion.mockResolvedValue({ id: 'task-1', status: 'completed' })
  localStorage.clear()
})

function renderApp(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

test('does not open the workspace when auth status cannot be checked', async () => {
  apiMocks.checkAuthStatus.mockRejectedValueOnce(new Error('auth unavailable'))

  renderApp()

  expect(await screen.findByRole('button', { name: '进入系统' })).toBeInTheDocument()
  expect(apiMocks.fetchPapers).not.toHaveBeenCalled()
})

test('启动时会校验本地 token，过期后直接回到登录页', async () => {
  localStorage.setItem('auth_token', 'expired-token')
  apiMocks.checkAuthStatus.mockResolvedValueOnce({
    requires_password: true,
    authenticated: false,
  })

  renderApp()

  expect(await screen.findByRole('button', { name: '进入系统' })).toBeInTheDocument()
  expect(apiMocks.fetchPapers).not.toHaveBeenCalled()
  expect(localStorage.getItem('auth_token')).toBeNull()
})

test('运行时收到未授权事件后会清空 token 并回到登录页', async () => {
  localStorage.setItem('auth_token', 'valid-token')
  apiMocks.checkAuthStatus.mockResolvedValueOnce({
    requires_password: true,
    authenticated: true,
  })
  apiMocks.fetchPapers.mockResolvedValueOnce([])

  renderApp()

  expect(await screen.findByText('论文工作台')).toBeInTheDocument()

  await act(async () => {
    window.dispatchEvent(new CustomEvent(apiMocks.UNAUTHORIZED_EVENT, {
      detail: { message: '登录已过期，请重新登录' },
    }))
  })

  expect(await screen.findByRole('button', { name: '进入系统' })).toBeInTheDocument()
  expect(localStorage.getItem('auth_token')).toBeNull()
})

test('初始渲染时显示浅色工作台标题与空态提示', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])

  renderApp()

  expect(await screen.findByText('论文工作台')).toBeInTheDocument()
  expect(await screen.findByText('还没有论文，请先导入')).toBeInTheDocument()
  expect(await screen.findByText('请选择左侧论文，或先导入新论文')).toBeInTheDocument()
})

test('点击列表项后继续显示摘要与正文', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
    },
  ])
  apiMocks.fetchPaperDetail.mockResolvedValueOnce({
    id: 1,
    title: 'Reader Ready',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    full_markdown: '# Reader Ready\n\n正文内容',
    abstract_md: '摘要章节',
    introduction_md: '引言章节',
    method_md: '方法章节',
    conclusion_md: '结论章节',
    one_line_summary: '一句话摘要',
    core_contributions: '核心贡献',
    method_summary: '方法概述',
    use_cases: '应用场景',
    limitations: '局限性',
    relevance_note: '相关性',
  })

  renderApp()

  fireEvent.click(await screen.findByText('Reader Ready'))

  expect(await screen.findByText('一句话摘要')).toBeInTheDocument()
  expect(screen.getByText('论文核心章节')).toBeInTheDocument()
})

test('导入成功后刷新列表并自动选中新论文', async () => {
  apiMocks.fetchPapers
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        id: 2,
        title: 'New Paper',
        source: 'manual',
        status: 'queued',
        parse_status: 'pending',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/new.pdf',
      },
    ])
  apiMocks.uploadPaper.mockResolvedValueOnce({
    id: 2,
    title: 'New Paper',
    source: 'manual',
    status: 'queued',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/new.pdf',
  })
  apiMocks.fetchPaperDetail.mockResolvedValueOnce({
    id: 2,
    title: 'New Paper',
    source: 'manual',
    status: 'queued',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/new.pdf',
    full_markdown: '# New Paper\n\n正文内容',
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
  })

  renderApp()

  fireEvent.change(await screen.findByLabelText('来源'), { target: { value: 'manual' } })
  const file = new File(['%PDF-1.4 mock'], 'new.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByTestId('paper-pdf-file-input'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: '导入' }))

  await waitFor(() => {
    expect(apiMocks.uploadPaper).toHaveBeenCalledWith({
      source: 'manual',
      file,
    })
  })

  expect(await screen.findByText('导入成功')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'New Paper', level: 1 })).toBeInTheDocument()
})

test('点击解析与生成摘要后调用对应 API 并刷新详情', async () => {
  apiMocks.fetchPapers
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Reader Ready',
        source: 'manual',
        status: 'parsed',
        parse_status: 'completed',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Reader Ready',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Reader Ready',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
      },
    ])
  apiMocks.fetchPaperDetail
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'parsed',
      parse_status: 'completed',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
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
    })
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
      abstract_md: '摘要章节',
      introduction_md: '引言章节',
      method_md: '方法章节',
      conclusion_md: '结论章节',
      one_line_summary: '一句话摘要',
      core_contributions: '核心贡献',
      method_summary: '方法概述',
      use_cases: '应用场景',
      limitations: '局限性',
      relevance_note: '相关性',
    })
    .mockResolvedValueOnce({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      full_markdown: '# Reader Ready\n\n正文内容',
      abstract_md: '摘要章节',
      introduction_md: '引言章节',
      method_md: '方法章节',
      conclusion_md: '结论章节',
      one_line_summary: '一句话摘要',
      core_contributions: '核心贡献',
      method_summary: '方法概述',
      use_cases: '应用场景',
      limitations: '局限性',
      relevance_note: '相关性',
    })

  apiMocks.parsePaper.mockResolvedValueOnce({ task_id: 'parse-task' })
  apiMocks.summarizePaper.mockResolvedValueOnce({ task_id: 'summary-task' })

  renderApp()

  fireEvent.click(await screen.findByText('Reader Ready'))
  fireEvent.click(await screen.findByRole('button', { name: '解析' }))
  fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }))

  await waitFor(() => expect(apiMocks.parsePaper).toHaveBeenCalledWith(1))
  await waitFor(() => expect(apiMocks.waitForTaskCompletion).toHaveBeenCalledWith('parse-task'))
  await waitFor(() => expect(apiMocks.summarizePaper).toHaveBeenCalledWith(1, 'gpt-5.4'))
  await waitFor(() => expect(apiMocks.waitForTaskCompletion).toHaveBeenCalledWith('summary-task'))
  expect(await screen.findByText('一句话摘要')).toBeInTheDocument()
})

test('导入失败时显示错误提示并保留表单输入', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.uploadPaper.mockRejectedValueOnce(new Error('PDF 文件不存在'))

  renderApp()

  const file = new File(['%PDF-1.4 mock'], 'missing.pdf', { type: 'application/pdf' })
  fireEvent.change(await screen.findByTestId('paper-pdf-file-input'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: '导入' }))

  expect(await screen.findByText('PDF 文件不存在')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByLabelText('来源')).toHaveValue('manual')
  })
})

test('首屏加载论文时显示加载提示而不是空列表提示', async () => {
  let resolvePapers: ((value: Array<{
    id: number
    title: string
    source: string
    status: string
    parse_status: string
    summary_status: string
    embedding_status: string
    local_pdf_path: string
  }>) => void) | undefined

  apiMocks.fetchPapers.mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePapers = resolve
    }),
  )

  renderApp()

  expect(await screen.findByText('正在加载论文...')).toBeInTheDocument()
  expect(screen.queryByText('还没有论文，请先导入')).not.toBeInTheDocument()

  resolvePapers?.([])

  expect(await screen.findByText('还没有论文，请先导入')).toBeInTheDocument()
})

test('切换论文但详情加载失败时清空旧详情并显示错误提示', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Paper A',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/a.pdf',
    },
    {
      id: 2,
      title: 'Paper B',
      source: 'manual',
      status: 'queued',
      parse_status: 'pending',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/b.pdf',
    },
  ])
  apiMocks.fetchPaperDetail
    .mockResolvedValueOnce({
      id: 1,
      title: 'Paper A',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/a.pdf',
      full_markdown: '# Paper A\n\n正文A',
      abstract_md: '摘要A',
      introduction_md: '',
      method_md: '',
      conclusion_md: '',
      one_line_summary: '一句话摘要A',
      core_contributions: '贡献A',
      method_summary: '方法A',
      use_cases: '',
      limitations: '局限A',
      relevance_note: '相关A',
    })
    .mockRejectedValueOnce(new Error('详情加载失败'))

  renderApp()

  fireEvent.click(await screen.findByText('Paper A'))
  expect(await screen.findByText('一句话摘要A')).toBeInTheDocument()
  expect(screen.getByText('论文核心章节')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Paper B'))

  expect(await screen.findByText('详情加载失败')).toBeInTheDocument()
  expect(screen.getByText('请选择左侧论文，或先导入新论文')).toBeInTheDocument()
  expect(screen.queryByText('一句话摘要A')).not.toBeInTheDocument()
  expect(screen.queryByText('正文A')).not.toBeInTheDocument()
})

test('可以切换到每日速览并展示速览壳层', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Briefing Paper',
      source: 'arxiv',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/briefing.pdf',
      tags: ['AI coding'],
    },
  ])
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: [
      '# 背景',
      '',
      '今日精选',
      '',
      '## 关键发现',
      '',
      '- [Briefing Paper](https://arxiv.org/abs/1234.5678) 值得优先阅读。',
      '',
      '## 行动项',
      '',
      '- 标记为已审阅。',
    ].join('\n'),
    paper_count: 4,
    project_count: 1,
    source_count: 7,
    fallback_used: false,
    top_papers: [
      {
        paper_id: 1,
        rank: 1,
        score: 163,
        reason: '与 AI coding 高相关',
        source_kind: 'arxiv',
        canonical_url: 'https://arxiv.org/abs/1234.5678',
        summary_text: '中文摘要：覆盖全部订阅论文',
      },
      {
        paper_id: 2,
        rank: 2,
        score: 141,
        reason: '补充研究方向的基础模型线索',
        source_kind: 'arxiv',
        title: 'Ranking Paper 2',
        summary_text: '第二篇摘要默认展示在关键建议内。',
      },
      {
        paper_id: 3,
        rank: 3,
        score: 128,
        reason: '可作为近期实验设计参考',
        source_kind: 'openreview',
        title: 'Ranking Paper 3',
        summary_text: '第三篇摘要默认展示在关键建议内。',
      },
      {
        paper_id: null,
        rank: 4,
        score: 91,
        reason: '信息不完整，展开后再确认是否处理',
        source_kind: 'rss',
        title: 'Ranking Paper 4',
        summary_text: '第四篇摘要默认折叠，避免右栏噪音。',
      },
    ],
    projects: [
      {
        rank: 1,
        title: 'openai/codex',
        url: 'https://github.com/openai/codex',
        summary: 'AI coding agent',
        source_kind: 'github_trending',
      },
    ],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([
    {
      briefing_date: '2026-04-19',
      status: 'completed',
      generated_at: '2026-04-19T12:00:00+08:00',
      daily_run_id: 1,
      trigger_type: 'scheduled',
      summary_markdown: '今日精选',
      paper_count: 1,
      project_count: 1,
      source_count: 2,
    },
  ])

  renderApp()

  fireEvent.click(await screen.findByRole('link', { name: /工作看板/ }))

  expect(await screen.findByText('今日精选')).toBeInTheDocument()
  const heroHeading = screen.getByRole('heading', { name: '每日速览' })
  expect(heroHeading.closest('.briefing-hero')).not.toBeNull()
  expect(screen.getByLabelText('搜索论文、项目或关键词')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '通知' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '日报控制台' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '今日研究快照' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '2026-04-19', level: 3 })).toBeInTheDocument()
  expect(screen.getByText('当前展示今天日报')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '先看这三条结论' })).toBeInTheDocument()
  expect(screen.getByText('已筛选 4 篇论文，生成 1 个项目观察，发现 7 个订阅源热点。')).toBeInTheDocument()
  expect(screen.getByText('最后生成：12:00')).toBeInTheDocument()
  expect(screen.getByText(/阅读进度：/)).toBeInTheDocument()
  expect(screen.getByText('今日关键词')).toBeInTheDocument()
  expect(screen.getByText('风险等级')).toBeInTheDocument()
  expect(screen.getByText('推荐阅读顺序')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看关键建议' })).toHaveAttribute('href', '#briefing-recommendations')
  expect(screen.getByRole('button', { name: '生成报告' })).toBeInTheDocument()
  expect(screen.getByText('聚合今日论文、项目与风险信号，用于快速决定阅读和处理顺序。')).toBeInTheDocument()
  expect(screen.getByText('当前模块')).toBeInTheDocument()
  const summaryHeading = screen.getByRole('heading', { name: '今日论文汇总' })
  expect(summaryHeading.closest('.briefing-main')).not.toBeNull()
  expect(screen.getByText('日报内容')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '文档目录' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '背景' })).toHaveAttribute('href', '#briefing-section-背景')
  expect(screen.getByRole('link', { name: '关键发现' })).toHaveAttribute('href', '#briefing-section-关键发现')
  expect(screen.getByRole('link', { name: '关键发现' })).toHaveAttribute('title', '关键发现')
  expect(screen.getByText('滚动标记')).toBeInTheDocument()
  expect(screen.getByLabelText('4 条建议 / 0 个风险 / 1 条参考')).toBeInTheDocument()
  expect(screen.getByLabelText('蓝色：论文')).toBeInTheDocument()
  expect(screen.getByLabelText('绿色：项目')).toBeInTheDocument()
  expect(screen.getByLabelText('红色：风险')).toBeInTheDocument()
  expect(screen.getByLabelText('黄色：重点')).toBeInTheDocument()
  expect(screen.getByLabelText('滚动锚点')).toBeInTheDocument()
  const briefingPaperLink = screen.getByRole('link', { name: 'Briefing Paper' })
  expect(briefingPaperLink).toHaveAttribute('href', '/paper/1')
  expect(screen.getByText('与 AI coding 高相关')).toBeInTheDocument()
  const rankingHeading = screen.getByText('关键建议')
  expect(rankingHeading.closest('.briefing-side-stack')).not.toBeNull()
  expect(screen.queryByText('今日论文候选')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '风险点' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '参考资料' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '历史记录' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '下一步建议' })).toBeInTheDocument()
  expect(screen.getAllByText('高优先级').length).toBeGreaterThan(0)
  expect(screen.getAllByText('建议动作').length).toBeGreaterThan(0)
  expect(screen.getByText('优先精读')).toBeInTheDocument()
  expect(screen.getAllByText('为什么推荐').length).toBeGreaterThan(0)
  expect(screen.getAllByText('适合谁看').length).toBeGreaterThan(0)
  expect(screen.queryByText('Ranking Paper 4')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '展开全部 4 条建议' }))
  expect(screen.getByText('Ranking Paper 4')).toBeInTheDocument()
  expect(screen.getAllByText('待确认').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '标记为已审阅' }))
  expect(screen.getByRole('button', { name: '已审阅' })).toBeInTheDocument()
  const projectButton = screen.getByRole('button', { name: /相关项目/ })
  expect(projectButton).toBeInTheDocument()
  expect(screen.queryByText('openai/codex')).not.toBeInTheDocument()
  fireEvent.click(projectButton)
  expect(await screen.findByRole('dialog', { name: '相关项目简介' })).toBeInTheDocument()
  expect(screen.getByText('openai/codex')).toBeInTheDocument()
  expect(screen.getByText('AI coding agent')).toBeInTheDocument()
  expect(screen.getByText('中文摘要：覆盖全部订阅论文')).toBeInTheDocument()
  expect(screen.getAllByText('关联主题：').length).toBeGreaterThan(0)
  expect(screen.getByText('AI coding')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /展开摘要/ }).length).toBeGreaterThan(0)
  expect(screen.queryByText('优先级 163')).not.toBeInTheDocument()
  expect(screen.queryByText('16300 分')).not.toBeInTheDocument()
  expect(screen.getByText('论文候选 4')).toBeInTheDocument()
  expect(screen.getByText('订阅源 7')).toBeInTheDocument()
  expect(screen.queryByText('运行中')).not.toBeInTheDocument()
  expect(screen.getAllByText('完成').length).toBeGreaterThan(0)
})

test('每日速览中的论文链接会跳转到论文管理详情', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Briefing Paper',
      source: 'https://arxiv.org/abs/1234.5678',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/briefing.pdf',
    },
  ])
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '今日精选\n\n- [Briefing Paper](https://arxiv.org/abs/1234.5678) 值得优先阅读。',
    paper_count: 1,
    project_count: 0,
    source_count: 1,
    fallback_used: false,
    top_papers: [
      {
        paper_id: 1,
        rank: 1,
        score: 163,
        reason: '与 AI coding 高相关',
        source_kind: 'arxiv',
        title: 'Briefing Paper',
        canonical_url: 'https://arxiv.org/abs/1234.5678',
        summary_text: '中文摘要：覆盖全部订阅论文',
      },
    ],
    projects: [],
  })
  apiMocks.fetchPaperDetail.mockResolvedValueOnce({
    id: 1,
    title: 'Briefing Paper',
    source: 'https://arxiv.org/abs/1234.5678',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/briefing.pdf',
    full_markdown: '# Briefing Paper\n\n正文内容',
    abstract_md: '摘要章节',
    introduction_md: '引言章节',
    method_md: '方法章节',
    conclusion_md: '结论章节',
    one_line_summary: '一句话摘要',
    core_contributions: '核心贡献',
    method_summary: '方法概述',
    use_cases: '应用场景',
    limitations: '局限性',
    relevance_note: '相关性',
  })

  const view = renderApp(['/briefing'])

  await waitFor(() => expect(view.container.querySelector('.briefing-summary')).not.toBeNull())
  const summary = view.container.querySelector('.briefing-summary') as HTMLElement
  const briefingPaperLink = await within(summary).findByRole('link', { name: 'Briefing Paper' })
  expect(briefingPaperLink).toHaveAttribute('href', '/paper/1')
  expect(fireEvent.click(briefingPaperLink)).toBe(false)

  expect(await screen.findByRole('heading', { name: '论文管理' })).toBeInTheDocument()
  await waitFor(() => expect(apiMocks.fetchPaperDetail).toHaveBeenCalledWith(1))
})

test('可以在工作看板更新自动化设置并触发今天补跑', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '今日精选',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([])
  apiMocks.fetchAutomationSettings.mockResolvedValueOnce({
    enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.updateAutomationSettings.mockResolvedValueOnce({
    enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: false,
  })
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '今日精选',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([])
  apiMocks.runTodayBriefing.mockResolvedValueOnce({ run_id: 7, status: 'completed' })
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 7,
      status: 'completed',
      trigger_type: 'manual',
      started_at: '2026-04-19T13:00:00+08:00',
      completed_at: '2026-04-19T13:02:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T13:02:00+08:00',
    daily_run_id: 7,
    trigger_type: 'manual',
    summary_markdown: '补跑完成',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([
    {
      briefing_date: '2026-04-19',
      status: 'completed',
      generated_at: '2026-04-19T13:02:00+08:00',
      daily_run_id: 7,
      trigger_type: 'manual',
      summary_markdown: '补跑完成',
      paper_count: 0,
      project_count: 0,
      source_count: 0,
    },
  ])

  renderApp(['/briefing'])

  fireEvent.click(await screen.findByRole('button', { name: '自动化设置' }))
  fireEvent.change(await screen.findByLabelText('生成时间'), { target: { value: '13:00' } })
  fireEvent.click(await screen.findByLabelText('显示相关项目'))
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  fireEvent.click(screen.getByRole('button', { name: '生成报告' }))

  await waitFor(() => expect(apiMocks.updateAutomationSettings).toHaveBeenCalledWith({
    enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: false,
  }))
  await waitFor(() => expect(apiMocks.runTodayBriefing).toHaveBeenCalled())
  expect(await screen.findAllByText('补跑完成')).not.toHaveLength(0)
  expect(await screen.findByText('计划时间 13:00')).toBeInTheDocument()
  expect(screen.getAllByText('Asia/Shanghai').length).toBeGreaterThan(0)
})

test('每日日报顶部控件区使用 command deck 并可展开历史日报', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
      progress: 100,
      progress_message: '',
      subscription_issues: [
        {
          subscription_id: 4,
          subscription_name: 'arXiv AI RSS',
          source_kind: 'rss',
          severity: 'warning',
          message: '该订阅源本次没有返回任何候选条目',
        },
      ],
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:05:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '今日日报',
    paper_count: 4,
    project_count: 2,
    source_count: 3,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([
    {
      briefing_date: '2026-04-18',
      status: 'completed',
      generated_at: '2026-04-18T12:05:00+08:00',
      daily_run_id: 2,
      trigger_type: 'manual',
      summary_markdown: '昨日日报',
      paper_count: 2,
      project_count: 1,
      source_count: 2,
    },
  ])

  renderApp(['/briefing'])

  expect(await screen.findByText('日期切换')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择日报日期' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /历史日报（1）/ })).toBeInTheDocument()
  expect(screen.getByText('计划时间 12:00')).toBeInTheDocument()
  expect(screen.getByText('订阅源问题反馈')).toBeInTheDocument()
  expect(screen.getAllByText('arXiv AI RSS').length).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: /历史日报（1）/ }))

  expect(await screen.findByRole('button', { name: '浏览日报日期' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /2026-04-18/ })).toBeInTheDocument()
})

test('补跑完成但今日日报仍是旧快照时不会误报成功', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:01:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:01:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '旧日报',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([])
  apiMocks.runTodayBriefing.mockResolvedValueOnce({ run_id: 7, status: 'completed' })
  apiMocks.fetchAutomationStatusToday.mockResolvedValue({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 7,
      status: 'completed',
      trigger_type: 'manual',
      started_at: '2026-04-19T13:00:00+08:00',
      completed_at: '2026-04-19T13:00:05+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefingHistory.mockResolvedValue([])
  apiMocks.fetchBriefing.mockResolvedValue({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:01:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '旧日报',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })

  renderApp(['/briefing'])

  fireEvent.click(await screen.findByRole('button', { name: '生成报告' }))

  await waitFor(() => expect(apiMocks.runTodayBriefing).toHaveBeenCalled())
  expect(await screen.findByText('补跑已完成，但最新日报尚未刷新到当前结果，请稍后再试')).toBeInTheDocument()
  expect(screen.queryByText('补跑完成')).not.toBeInTheDocument()
})

test('自动化关闭且回退旧日报时会展示状态说明', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-18',
    status: 'completed',
    generated_at: '2026-04-18T12:00:00+08:00',
    daily_run_id: 3,
    trigger_type: 'scheduled',
    summary_markdown: '昨日日报',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: true,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([
    {
      briefing_date: '2026-04-18',
      status: 'completed',
      generated_at: '2026-04-18T12:00:00+08:00',
      daily_run_id: 3,
      trigger_type: 'scheduled',
      summary_markdown: '昨日日报',
      paper_count: 0,
      project_count: 0,
      source_count: 0,
    },
  ])
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: false,
    briefing_enabled: false,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: null,
    today_briefing_exists: false,
    fallback_used: true,
    fallback_briefing_date: '2026-04-18',
  })

  renderApp(['/briefing'])

  expect(await screen.findByText('自动化已关闭')).toBeInTheDocument()
  expect(screen.getByText('今日 2026-04-19 暂无成功日报，当前展示 2026-04-18 的回退日报')).toBeInTheDocument()
})

test('静默刷新失败时会保留当前日报内容', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    daily_run_id: 1,
    trigger_type: 'scheduled',
    summary_markdown: '初始日报',
    paper_count: 0,
    project_count: 0,
    source_count: 0,
    fallback_used: false,
    top_papers: [],
    projects: [],
  })
  apiMocks.fetchBriefingHistory.mockResolvedValueOnce([])
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.updateAutomationSettings.mockResolvedValueOnce({
    enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.fetchAutomationStatusToday.mockResolvedValueOnce({
    local_today: '2026-04-19',
    enabled: true,
    briefing_enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    today_run: {
      id: 1,
      status: 'completed',
      trigger_type: 'scheduled',
      started_at: '2026-04-19T12:00:00+08:00',
      completed_at: '2026-04-19T12:05:00+08:00',
      error_message: null,
    },
    today_briefing_exists: true,
    fallback_used: false,
    fallback_briefing_date: null,
  })
  apiMocks.fetchBriefing.mockRejectedValueOnce(new Error('刷新每日速览失败'))
  apiMocks.fetchBriefingHistory.mockRejectedValueOnce(new Error('history unavailable'))

  renderApp(['/briefing'])

  expect(await screen.findByText('初始日报')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '自动化设置' }))
  fireEvent.change(await screen.findByLabelText('生成时间'), { target: { value: '13:00' } })
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

  expect((await screen.findAllByText('刷新每日速览失败')).length).toBeGreaterThan(0)
  expect(screen.getByText('初始日报')).toBeInTheDocument()
  expect(screen.getByText('计划时间 13:00')).toBeInTheDocument()
})

test('可以切换到数据统计并展示统计壳层', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Stats Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/stats-ready.pdf',
    },
    {
      id: 2,
      title: 'Stats Parsed',
      source: 'manual',
      status: 'parsed',
      parse_status: 'completed',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/stats-parsed.pdf',
    },
  ])

  renderApp()

  fireEvent.click(await screen.findByRole('link', { name: /学术追踪/ }))

  await waitFor(() => {
    expect(screen.getAllByRole('heading', { name: '学术追踪', level: 1 }).length).toBeGreaterThanOrEqual(1)
  })
  expect(screen.getByText('总文章数')).toBeInTheDocument()
  expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
})

test('可以从侧栏切换到 AI 研究助手壳层', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([])

  renderApp()

  fireEvent.click(await screen.findByRole('link', { name: /AI 研究助手/ }))

  expect(await screen.findByText('对话历史')).toBeInTheDocument()
  expect(screen.getByText('总结我论文库中的研究方向')).toBeInTheDocument()
})

test('可以从侧栏切换到 AI 智能推荐壳层', async () => {
  const paper = {
    id: 1,
    title: 'Recommend Me',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/recommend.pdf',
    tags: ['LLM'],
  }
  apiMocks.fetchPapers.mockResolvedValueOnce([paper])
  apiMocks.fetchRecommendations.mockResolvedValueOnce([
    {
      paper,
      score: 188,
      reason: '已完成摘要且与当前研究方向高度相关，适合优先阅读。',
      tag: 'LLM',
      priority_icon: 'target',
      future_direction: '可继续检索智能体评测方向论文。',
      category: 'read_now',
      category_label: '优先阅读',
      status_label: '已就绪',
      action_label: '开始阅读',
      action_hint: '已有摘要和状态信号，适合作为当前阅读入口。',
      confidence: 96,
      signals: ['已有中文摘要', '标签：LLM'],
      score_breakdown: ['状态已就绪 +100', '摘要完成 +30'],
    },
  ])

  renderApp()

  fireEvent.click(await screen.findByRole('link', { name: /AI 智能推荐/ }))

  expect(await screen.findByRole('heading', { name: '个性化论文推荐', level: 2 })).toBeInTheDocument()
  expect(screen.getAllByText('Recommend Me').length).toBeGreaterThan(0)
  expect(screen.getByText('AI Reading Radar')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /全部推荐/ })).toBeInTheDocument()
  expect(screen.getByText('为什么推荐')).toBeInTheDocument()
  expect(screen.getAllByText('已有中文摘要').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '开始阅读' })).toBeInTheDocument()
})

test('点击新订阅进入订阅管理视图', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  apiMocks.fetchPapers.mockResolvedValueOnce([])

  try {
    renderApp()

    fireEvent.click(await screen.findByRole('link', { name: /AI 研究助手/ }))
    expect(await screen.findByText('对话历史')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /新订阅/ }))

    expect(await screen.findByText('订阅管理')).toBeInTheDocument()
    expect(screen.getByText('arXiv 快速搜索')).toBeInTheDocument()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
  } finally {
    fetchSpy.mockRestore()
  }
})
test('可以按左侧分类目录筛选论文管理列表', async () => {
  const dispatchEventMock = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  apiMocks.fetchCategories.mockResolvedValue([
    {
      id: 1,
      name: '待确认',
      slug: '待确认',
      description: 'Needs manual review',
      is_system: true,
      is_active: true,
      is_pending_bucket: true,
      paper_count: 0,
      pending_count: 0,
    },
    {
      id: 2,
      name: '强化学习',
      slug: '强化学习',
      description: 'RL papers',
      is_system: true,
      is_active: true,
      is_pending_bucket: false,
      paper_count: 1,
      pending_count: 0,
    },
    {
      id: 3,
      name: '时间序列',
      slug: '时间序列',
      description: 'Forecasting papers',
      is_system: true,
      is_active: true,
      is_pending_bucket: false,
      paper_count: 1,
      pending_count: 0,
    },
  ])
  apiMocks.fetchPapers.mockResolvedValue([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      primary_category_id: 2,
      category_status: 'auto_confirmed',
      category_confidence: 0.93,
      tags: ['强化学习'],
    },
    {
      id: 2,
      title: 'Forecast Lab',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/forecast.pdf',
      primary_category_id: 3,
      category_status: 'auto_confirmed',
      category_confidence: 0.88,
      tags: ['时间序列'],
    },
  ])

  try {
    renderApp()

    const rlCategoryButton = await screen.findByRole('button', { name: '强化学习 (1)' })
    fireEvent.click(rlCategoryButton)

    await waitFor(() => {
      expect(rlCategoryButton).toHaveClass('active')
    })
    expect(screen.getByText('Reader Ready')).toBeInTheDocument()
    expect(screen.queryByText('Forecast Lab')).not.toBeInTheDocument()
  } finally {
    dispatchEventMock.mockRestore()
  }
})

test('可以一键重试所有 parse_failed 论文的解析任务', async () => {
  apiMocks.checkAuthStatus.mockResolvedValueOnce({ requires_password: false })
  apiMocks.fetchPapers
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Broken Parse A',
        source: 'arxiv',
        status: 'parse_failed',
        parse_status: 'failed',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/a.pdf',
      },
      {
        id: 2,
        title: 'Broken Parse B',
        source: 'manual',
        status: 'parse_failed',
        parse_status: 'failed',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/b.pdf',
      },
      {
        id: 3,
        title: 'Ready Paper',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/c.pdf',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Broken Parse A',
        source: 'arxiv',
        status: 'parsing',
        parse_status: 'processing',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/a.pdf',
      },
      {
        id: 2,
        title: 'Broken Parse B',
        source: 'manual',
        status: 'parsing',
        parse_status: 'processing',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/b.pdf',
      },
      {
        id: 3,
        title: 'Ready Paper',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/c.pdf',
      },
    ])

  apiMocks.parsePaper
    .mockResolvedValueOnce({ task_id: 'retry-task-1' })
    .mockResolvedValueOnce({ task_id: 'retry-task-2' })

  renderApp()

  expect(await screen.findByRole('status')).toHaveTextContent('解析失败 2 篇')

  fireEvent.click(screen.getByRole('button', { name: '全部重试解析' }))

  await waitFor(() => {
    expect(apiMocks.parsePaper).toHaveBeenCalledTimes(2)
  })
  expect(apiMocks.parsePaper).toHaveBeenNthCalledWith(1, 1)
  expect(apiMocks.parsePaper).toHaveBeenNthCalledWith(2, 2)
  expect(apiMocks.waitForTaskCompletion).not.toHaveBeenCalled()
  expect(await screen.findByText('已提交 2 篇失败论文的重新解析任务')).toBeInTheDocument()
})

test('可以一键删除所有 parse_failed 论文', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  apiMocks.checkAuthStatus.mockResolvedValueOnce({ requires_password: false })
  apiMocks.fetchPapers
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Broken Parse A',
        source: 'arxiv',
        status: 'parse_failed',
        parse_status: 'failed',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/a.pdf',
      },
      {
        id: 2,
        title: 'Broken Parse B',
        source: 'manual',
        status: 'parse_failed',
        parse_status: 'failed',
        summary_status: 'pending',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/b.pdf',
      },
      {
        id: 3,
        title: 'Ready Paper',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/c.pdf',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 3,
        title: 'Ready Paper',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/c.pdf',
      },
    ])

  try {
    renderApp()

    expect(await screen.findByRole('status')).toHaveTextContent('解析失败 2 篇')

    fireEvent.click(screen.getByRole('button', { name: '全部删除失败论文' }))

    await waitFor(() => {
      expect(apiMocks.deletePaper).toHaveBeenCalledTimes(2)
    })
    expect(confirmSpy).toHaveBeenCalled()
    expect(apiMocks.deletePaper).toHaveBeenNthCalledWith(1, 1)
    expect(apiMocks.deletePaper).toHaveBeenNthCalledWith(2, 2)
    expect(await screen.findByText('已删除 2 篇解析失败论文')).toBeInTheDocument()
  } finally {
    confirmSpy.mockRestore()
  }
})

test('重新进入论文详情页时会根据后端状态继续显示解析中', async () => {
  apiMocks.fetchPapers.mockResolvedValueOnce([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'parsing',
      parse_status: 'processing',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
    },
  ])
  apiMocks.fetchPaperDetail.mockResolvedValueOnce({
    id: 1,
    title: 'Reader Ready',
    source: 'manual',
    status: 'parsing',
    parse_status: 'processing',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    full_markdown: '',
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
  })

  renderApp(['/paper/1'])

  await screen.findByText('Reader Ready')
  const parseButton = document.querySelector('#btn-parse') as HTMLButtonElement | null

  expect(parseButton).not.toBeNull()
  await waitFor(() => expect(parseButton).toBeDisabled())
  expect(parseButton).toHaveTextContent('解析中')
  expect(apiMocks.parsePaper).not.toHaveBeenCalled()
})

test('可以在论文详情里手动调整主分类', async () => {
  const dispatchEventMock = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  apiMocks.fetchCategories.mockResolvedValueOnce([
    {
      id: 1,
      name: '待确认',
      slug: '待确认',
      description: 'Needs manual review',
      is_system: true,
      is_active: true,
      is_pending_bucket: true,
      paper_count: 1,
      pending_count: 1,
    },
    {
      id: 2,
      name: '强化学习',
      slug: '强化学习',
      description: 'RL papers',
      is_system: true,
      is_active: true,
      is_pending_bucket: false,
      paper_count: 0,
      pending_count: 0,
    },
  ])
  apiMocks.fetchPapers
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Needs Review',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
        primary_category_id: 1,
        category_status: 'pending_review',
        category_confidence: 0.2,
        category_reason: 'Low confidence',
        tags: ['物理模拟'],
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Needs Review',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
        primary_category_id: 2,
        category_status: 'manual_locked',
        category_confidence: 1,
        category_reason: 'Manual assignment',
        tags: ['物理模拟'],
      },
    ])
  apiMocks.fetchPaperDetail
    .mockResolvedValueOnce({
      id: 1,
      title: 'Needs Review',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      primary_category_id: 1,
      category_status: 'pending_review',
      category_confidence: 0.2,
      category_reason: 'Low confidence',
      tags: ['物理模拟'],
      full_markdown: '# Needs Review\n\nBody',
      abstract_md: 'Abstract',
      introduction_md: '',
      method_md: '',
      conclusion_md: '',
      one_line_summary: 'One line',
      core_contributions: 'Contrib',
      method_summary: 'Method',
      use_cases: '',
      limitations: '',
      relevance_note: '',
    })
    .mockResolvedValueOnce({
      id: 1,
      title: 'Needs Review',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
      primary_category_id: 2,
      category_status: 'manual_locked',
      category_confidence: 1,
      category_reason: 'Manual assignment',
      tags: ['物理模拟'],
      full_markdown: '# Needs Review\n\nBody',
      abstract_md: 'Abstract',
      introduction_md: '',
      method_md: '',
      conclusion_md: '',
      one_line_summary: 'One line',
      core_contributions: 'Contrib',
      method_summary: 'Method',
      use_cases: '',
      limitations: '',
      relevance_note: '',
    })
  apiMocks.updatePaperCategory.mockResolvedValueOnce({
    id: 1,
    title: 'Needs Review',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    primary_category_id: 2,
    category_status: 'manual_locked',
    category_confidence: 1,
    category_reason: 'Manual assignment',
    tags: ['物理模拟'],
  })

  try {
    renderApp()

    fireEvent.click(await screen.findByText('Needs Review'))
    fireEvent.change(await screen.findByLabelText('主分类'), { target: { value: '2' } })

    await waitFor(() => expect(apiMocks.updatePaperCategory).toHaveBeenCalledWith(1, 2))
  } finally {
    dispatchEventMock.mockRestore()
  }
})

test('手动调整主分类后若论文移出当前目录则返回空态而不继续加载详情', async () => {
  const dispatchEventMock = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  apiMocks.fetchCategories
    .mockResolvedValueOnce([
      {
        id: 1,
        name: '待确认',
        slug: '待确认',
        description: 'Needs manual review',
        is_system: true,
        is_active: true,
        is_pending_bucket: true,
        paper_count: 1,
        pending_count: 1,
      },
      {
        id: 2,
        name: '强化学习',
        slug: '强化学习',
        description: 'RL papers',
        is_system: true,
        is_active: true,
        is_pending_bucket: false,
        paper_count: 0,
        pending_count: 0,
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        name: '待确认',
        slug: '待确认',
        description: 'Needs manual review',
        is_system: true,
        is_active: true,
        is_pending_bucket: true,
        paper_count: 0,
        pending_count: 0,
      },
      {
        id: 2,
        name: '强化学习',
        slug: '强化学习',
        description: 'RL papers',
        is_system: true,
        is_active: true,
        is_pending_bucket: false,
        paper_count: 1,
        pending_count: 0,
      },
    ])
  apiMocks.fetchPapers
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Needs Review',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
        primary_category_id: 1,
        category_status: 'pending_review',
        category_confidence: 0.2,
        category_reason: 'Low confidence',
        tags: ['物理模拟'],
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 1,
        title: 'Needs Review',
        source: 'manual',
        status: 'ready',
        parse_status: 'completed',
        summary_status: 'completed',
        embedding_status: 'pending',
        local_pdf_path: '/tmp/sample.pdf',
        primary_category_id: 2,
        category_status: 'manual_locked',
        category_confidence: 1,
        category_reason: 'Manual assignment',
        tags: ['物理模拟'],
      },
    ])
  apiMocks.fetchPaperDetail.mockResolvedValueOnce({
    id: 1,
    title: 'Needs Review',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    primary_category_id: 1,
    category_status: 'pending_review',
    category_confidence: 0.2,
    category_reason: 'Low confidence',
    tags: ['物理模拟'],
    full_markdown: '# Needs Review\n\nBody',
    abstract_md: 'Abstract',
    introduction_md: '',
    method_md: '',
    conclusion_md: '',
    one_line_summary: 'One line',
    core_contributions: 'Contrib',
    method_summary: 'Method',
    use_cases: '',
    limitations: '',
    relevance_note: '',
  })
  apiMocks.updatePaperCategory.mockResolvedValueOnce({
    id: 1,
    title: 'Needs Review',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    primary_category_id: 2,
    category_status: 'manual_locked',
    category_confidence: 1,
    category_reason: 'Manual assignment',
    tags: ['物理模拟'],
  })

  try {
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: /待确认 \(1\)/ }))
    fireEvent.click(await screen.findByText('Needs Review'))
    const primaryCategoryField = await screen.findByLabelText('主分类')
    const detailLoadCountBeforeChange = apiMocks.fetchPaperDetail.mock.calls.length
    fireEvent.change(primaryCategoryField, { target: { value: '2' } })

    await waitFor(() => expect(apiMocks.updatePaperCategory).toHaveBeenCalledWith(1, 2))
    await waitFor(() => expect(screen.getByText('请选择左侧论文，或先导入新论文')).toBeInTheDocument())

    expect(apiMocks.fetchPaperDetail).toHaveBeenCalledTimes(detailLoadCountBeforeChange)
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument()
    expect(screen.getByText('主分类已更新，论文已移出当前目录')).toBeInTheDocument()
  } finally {
    dispatchEventMock.mockRestore()
  }
})
