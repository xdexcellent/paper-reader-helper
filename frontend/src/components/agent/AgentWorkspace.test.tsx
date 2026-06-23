// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  createAgentRun: vi.fn(),
  approveAgentAction: vi.fn(),
  batchApproveAgentActions: vi.fn(),
  rejectAgentAction: vi.fn(),
  revertAgentAction: vi.fn(),
  fetchAgentRunDetail: vi.fn(),
  fetchAgentRuns: vi.fn(),
  fetchAiProviderSettings: vi.fn(),
}))

vi.mock('../../lib/api', () => apiMocks)

import { AgentWorkspace } from './AgentWorkspace'

beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset()
    }
  })
  apiMocks.createAgentRun.mockRejectedValue(new Error('not called'))
  apiMocks.approveAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.rejectAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.revertAgentAction.mockRejectedValue(new Error('not called'))
  apiMocks.fetchAgentRuns.mockResolvedValue([])
  apiMocks.fetchAiProviderSettings.mockResolvedValue({
    provider_name: 'OpenAI Compatible',
    api_base: 'https://api.example.com',
    api_key_set: false,
    api_key_preview: '',
    default_model: 'model-a',
    available_models: ['model-a', 'model-b'],
  })
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

  render(<AgentWorkspace />)

  expect(screen.getByLabelText('选择 Agent 操作范围')).toBeInTheDocument()
  expect(screen.getByLabelText('Agent 提示词')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '运行 Agent' })).toBeInTheDocument()
})

test('submit disabled when prompt is empty', () => {
  apiMocks.createAgentRun.mockResolvedValue({ actions: [] })

  render(<AgentWorkspace />)

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

  render(<AgentWorkspace />)

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: '帮我整理论文库' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  await waitFor(() => expect(apiMocks.createAgentRun).toHaveBeenCalledWith({
    prompt: '帮我整理论文库',
    scope: { scope_type: 'whole_library' },
  }))

  expect(await screen.findByText('工具调用追踪 (1)')).toBeInTheDocument()
  expect(screen.getByText('更新标签')).toBeInTheDocument()
})

test('shows error on run failure', async () => {
  apiMocks.createAgentRun.mockRejectedValue(new Error('Agent 服务不可用'))

  render(<AgentWorkspace />)

  fireEvent.change(screen.getByLabelText('Agent 提示词'), {
    target: { value: 'test' },
  })
  fireEvent.click(screen.getByRole('button', { name: '运行 Agent' }))

  expect(await screen.findByText('Agent 服务不可用')).toBeInTheDocument()
})
