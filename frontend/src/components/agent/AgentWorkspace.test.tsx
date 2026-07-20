// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'

import type { Category, Paper } from '../../types'

const apiMocks = vi.hoisted(() => ({
  createAgentRun: vi.fn(),
  approveAgentAction: vi.fn(),
  batchApproveAgentActions: vi.fn(),
  checkHealth: vi.fn(),
  rejectAgentAction: vi.fn(),
  revertAgentAction: vi.fn(),
  fetchAgentRunDetail: vi.fn(),
  fetchAgentRuns: vi.fn(),
}))

vi.mock('../../lib/api', () => apiMocks)

import { AgentWorkspace } from './AgentWorkspace'

async function renderWorkspace(
  initialEntries = ['/agent'],
  props?: { papers?: Paper[]; categories?: Category[] },
) {
  let rendered!: ReturnType<typeof render>
  await act(async () => {
    rendered = render(
      <MemoryRouter initialEntries={initialEntries}>
        <AgentWorkspace {...props} />
      </MemoryRouter>,
    )
  })
  return rendered
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('agent_remote_ai_consent_v1', 'accepted')
  Object.values(apiMocks).forEach((mock) => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset()
    }
  })
  apiMocks.createAgentRun.mockRejectedValue(new Error('not called'))
  apiMocks.approveAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.checkHealth.mockReturnValue(new Promise(() => {}))
  apiMocks.rejectAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.revertAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.fetchAgentRuns.mockResolvedValue([])
})

test('renders agent workspace with scope picker and prompt input', async () => {
  apiMocks.createAgentRun.mockResolvedValue({
    id: 1,
    prompt: 'test',
    scope: { scope_type: 'whole_library' },
    model: 'gpt-5.4',
    status: 'completed',
    actions: [],
    tool_events: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  await renderWorkspace()

  expect(screen.getByLabelText('选择 Agent 操作范围')).toBeInTheDocument()
  expect(screen.getByLabelText('Agent 提示词')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '运行 Agent' })).toBeInTheDocument()
})

test('submit disabled when prompt is empty', async () => {
  apiMocks.createAgentRun.mockResolvedValue({ actions: [] })

  await renderWorkspace()

  const button = screen.getByRole('button', { name: '运行 Agent' })
  expect(button).toBeDisabled()
})

test('can type prompt and submit', async () => {
  apiMocks.createAgentRun.mockResolvedValue({
    id: 1,
    prompt: '帮我整理论文库',
    scope: { scope_type: 'whole_library' },
    model: 'gpt-5.4',
    status: 'completed',
    actions: [
      {
        id: 10,
        agent_run_id: 1,
        action_type: 'update_tags',
        target_paper_id: 1,
        before_values: { tags: [] },
        after_values: { tags: ['llm'] },
        rationale: '推荐标记为 llm',
        confidence: 0.9,
        risk_level: 'low',
        status: 'proposed',
        rejection_reason: '',
        error_message: '',
      },
    ],
    tool_events: [
      {
        id: 1,
        tool_name: 'list_papers',
        input_summary: 'scope=whole_library',
        output_summary: '返回 5 篇论文',
        status: 'success',
        error_message: '',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  await renderWorkspace()

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: '帮我整理论文库' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  await waitFor(() => expect(apiMocks.createAgentRun).toHaveBeenCalledWith(
    {
      prompt: '帮我整理论文库',
      scope: { scope_type: 'whole_library' },
    },
    expect.objectContaining({ signal: expect.any(Object) }),
  ))

  expect(await screen.findByText('工具调用追踪 (1)')).toBeInTheDocument()
  expect(screen.getByText('更新标签')).toBeInTheDocument()
})

test('shows error on run failure', async () => {
  apiMocks.createAgentRun.mockRejectedValue(new Error('Agent 服务不可用'))

  await renderWorkspace()

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: 'test' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  expect(await screen.findByText('Agent 服务不可用')).toBeInTheDocument()
})

test('can stop an in-flight agent run', async () => {
  apiMocks.createAgentRun.mockReturnValue(new Promise(() => {}))

  await renderWorkspace()

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: 'test' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  const stopButton = await screen.findByRole('button', { name: '停止当前 Agent 运行' })
  const [, options] = apiMocks.createAgentRun.mock.calls[0]
  const signal = options.signal as AbortSignal
  expect(signal.aborted).toBe(false)

  fireEvent.click(stopButton)

  expect(signal.aborted).toBe(true)
  expect(await screen.findByText('已停止等待本次运行结果。')).toBeInTheDocument()
})

test('requires inline remote AI consent before first run', async () => {
  window.localStorage.removeItem('agent_remote_ai_consent_v1')
  apiMocks.createAgentRun.mockResolvedValue({
    id: 1,
    prompt: 'test',
    scope: { scope_type: 'whole_library' },
    model: 'gpt-5.4',
    status: 'completed',
    actions: [],
    tool_events: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  await renderWorkspace()

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: 'test' },
  })

  const runButton = screen.getByRole('button', { name: '运行 Agent' })
  expect(runButton).toBeDisabled()
  expect(screen.queryByRole('dialog', { name: '远端 AI 使用确认' })).not.toBeInTheDocument()
  expect(screen.getByText('我了解本次运行会调用已配置的 AI 服务，并只发送任务所需上下文。')).toBeInTheDocument()
  expect(apiMocks.createAgentRun).not.toHaveBeenCalled()

  fireEvent.click(screen.getByLabelText('我了解本次运行会调用已配置的 AI 服务，并只发送任务所需上下文。'))
  expect(window.localStorage.getItem('agent_remote_ai_consent_v1')).toBe('accepted')
  await waitFor(() => expect(runButton).not.toBeDisabled())

  fireEvent.click(runButton)

  await waitFor(() => expect(apiMocks.createAgentRun).toHaveBeenCalledWith(
    {
      prompt: 'test',
      scope: { scope_type: 'whole_library' },
    },
    expect.objectContaining({ signal: expect.any(Object) }),
  ))
})

test('papers scope from url requires at least one selected paper', async () => {
  await renderWorkspace(['/agent?scope=papers'])

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: '帮我整理选中的论文' },
  })

  expect(screen.getByText('请至少选择一篇论文；你可以从论文库多选带入，或在这里搜索后添加。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '运行 Agent' })).toBeDisabled()
})

const MOCK_PAPERS: Paper[] = [
  { id: 1, title: 'Attention Is All You Need', source: 'arxiv', tags: ['transformer'], status: 'active' },
  { id: 2, title: 'BERT Pre-training', source: 'acl', tags: ['nlp'], status: 'active' },
  { id: 3, title: 'Diffusion Models Survey', source: 'arxiv', tags: ['diffusion'], status: 'active' },
] as Paper[]

test('papers scope from url shows selected papers and supports remove', async () => {
  await renderWorkspace(['/agent?scope=papers&paper_ids=1,2'], { papers: MOCK_PAPERS })

  expect(await screen.findByText('Attention Is All You Need')).toBeInTheDocument()
  expect(screen.getByText('BERT Pre-training')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '移除 Attention Is All You Need' }))

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: '移除 Attention Is All You Need' })).not.toBeInTheDocument()
  })
  expect(screen.getByText('BERT Pre-training')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加 Attention Is All You Need 到指定论文范围' })).toBeInTheDocument()
})

test('papers scope allows adding paper via search', async () => {
  await renderWorkspace(['/agent?scope=papers&paper_ids=1'], { papers: MOCK_PAPERS })

  expect(await screen.findByText('Attention Is All You Need')).toBeInTheDocument()

  // 搜索另一篇
  fireEvent.change(screen.getByLabelText('搜索可添加论文'), {
    target: { value: 'Diffusion' },
  })

  expect(await screen.findByRole('button', { name: '添加 Diffusion Models Survey 到指定论文范围' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '添加 Diffusion Models Survey 到指定论文范围' }))

  await waitFor(() => {
    expect(screen.getByText('Diffusion Models Survey')).toBeInTheDocument()
  })
})

test('reader_paper scope shows current paper and supports switching', async () => {
  await renderWorkspace(['/agent?scope=reader_paper&paper_id=1'], { papers: MOCK_PAPERS })

  expect(await screen.findByText('当前绑定论文：Attention Is All You Need')).toBeInTheDocument()

  // 切换论文
  const select = screen.getByLabelText('当前阅读论文')
  fireEvent.change(select, { target: { value: '3' } })

  await waitFor(() => {
    expect(screen.getByText('当前绑定论文：Diffusion Models Survey')).toBeInTheDocument()
  })
})

test('reader_paper scope without paper_id shows guidance', async () => {
  await renderWorkspace(['/agent?scope=reader_paper'], { papers: MOCK_PAPERS })

  expect(await screen.findByText(/当前没有从阅读器带入论文/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '运行 Agent' })).toBeDisabled()
})

test('reader_paper example prompt does not fabricate a default paper', async () => {
  await renderWorkspace(['/agent'], { papers: MOCK_PAPERS })

  fireEvent.click(screen.getByRole('button', { name: '总结当前阅读论文的核心贡献' }))

  expect(await screen.findByText(/当前没有从阅读器带入论文/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '运行 Agent' })).toBeDisabled()
  expect(screen.queryByText(/当前绑定论文：/)).not.toBeInTheDocument()
})

test('shows semantic search degradation warning', async () => {
  apiMocks.createAgentRun.mockResolvedValue({
    id: 2,
    prompt: '整理',
    scope: { scope_type: 'whole_library' },
    model: 'gpt-5.4',
    status: 'completed',
    actions: [],
    tool_events: [
      {
        id: 1,
        tool_name: 'semantic_search',
        input_summary: '',
        output_summary: '',
        status: 'warning',
        error_message: '语义检索不可用，已退化为非语义分析。',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  await renderWorkspace()

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: '整理' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  expect(await screen.findByText('语义检索不可用，已退化为非语义分析。')).toBeInTheDocument()
})

test('shows embedding unavailable warning in disclosure section', async () => {
  apiMocks.checkHealth.mockResolvedValue({ status: 'ok', embedding_available: false })

  await renderWorkspace()

  expect(
    await screen.findByText(/当前向量化不可用，宽范围任务会自动降级为非语义分析/),
  ).toBeInTheDocument()
})
