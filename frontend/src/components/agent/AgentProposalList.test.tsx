// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AgentAction } from '../../types'
import { AgentProposalList } from './AgentProposalList'

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 1,
    agent_run_id: 1,
    action_type: 'update_tags',
    target_paper_id: 10,
    target_category_id: null,
    before_values: { tags: [] },
    after_values: { tags: ['ml'] },
    rationale: '与机器学习相关',
    confidence: 0.85,
    risk_level: 'low',
    status: 'proposed',
    rejection_reason: '',
    error_message: '',
    ...overrides,
  }
}

const noop = vi.fn()

describe('AgentProposalList', () => {
  it('returns null when actions list is empty', () => {
    const { container } = render(
      <AgentProposalList
        actions={[]}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders actions grouped by risk level', () => {
    const actions: AgentAction[] = [
      makeAction({ id: 1, risk_level: 'low', action_type: 'update_tags' }),
      makeAction({ id: 2, risk_level: 'high', action_type: 'create_category' }),
      makeAction({ id: 3, risk_level: 'medium', action_type: 'update_category' }),
    ]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    // 风险组标题（低风险同时出现在组标题和 badge 中，用 getAllByText）
    expect(screen.getAllByText(/低风险/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/中风险/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/高风险/).length).toBeGreaterThan(0)

    // 操作类型
    expect(screen.getByText('更新标签')).toBeInTheDocument()
    expect(screen.getByText('创建分类')).toBeInTheDocument()
    expect(screen.getByText('更新分类')).toBeInTheDocument()
  })

  it('shows batch approve button only for low-risk proposed actions', () => {
    const actions: AgentAction[] = [
      makeAction({ id: 1, risk_level: 'low' }),
      makeAction({ id: 2, risk_level: 'low' }),
      makeAction({ id: 3, risk_level: 'high', action_type: 'create_category' }),
    ]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    const batchBtn = screen.getByRole('button', { name: /批量批准.*低风险/ })
    expect(batchBtn).toBeInTheDocument()
    expect(batchBtn).toHaveTextContent('批量批准低风险 (2)')
  })

  it('does not show batch approve button when no low-risk actions exist', () => {
    const actions: AgentAction[] = [
      makeAction({ id: 1, risk_level: 'high', action_type: 'create_category' }),
      makeAction({ id: 2, risk_level: 'medium', action_type: 'update_category' }),
    ]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /批量批准/ })).not.toBeInTheDocument()
  })

  it('calls onApprove with correct action id', () => {
    const onApprove = vi.fn()
    const actions = [makeAction({ id: 42 })]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={onApprove}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '批准操作 42' }))
    expect(onApprove).toHaveBeenCalledWith(42)
  })

  it('calls onReject with action id and rejection reason', () => {
    const onReject = vi.fn()
    const actions = [makeAction({ id: 7 })]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={onReject}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    const reasonInput = screen.getByLabelText('拒绝操作 7 的原因')
    fireEvent.change(reasonInput, { target: { value: '分类命名不合适' } })
    fireEvent.click(screen.getByRole('button', { name: '拒绝操作 7' }))

    expect(onReject).toHaveBeenCalledWith(7, '分类命名不合适')
  })

  it('calls onBatchApprove with only low-risk action ids', () => {
    const onBatchApprove = vi.fn()
    const actions: AgentAction[] = [
      makeAction({ id: 1, risk_level: 'low' }),
      makeAction({ id: 2, risk_level: 'low' }),
      makeAction({ id: 3, risk_level: 'high', action_type: 'create_category' }),
    ]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={onBatchApprove}
        loading={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /批量批准.*低风险/ }))
    expect(onBatchApprove).toHaveBeenCalledWith([1, 2])
  })

  it('shows revert button for executed actions', () => {
    const onRevert = vi.fn()
    const actions = [makeAction({ id: 5, status: 'executed' })]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={onRevert}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    const revertBtn = screen.getByRole('button', { name: '撤销操作 5' })
    expect(revertBtn).toBeInTheDocument()

    fireEvent.click(revertBtn)
    expect(onRevert).toHaveBeenCalledWith(5)
  })

  it('disables action buttons when loading', () => {
    const actions = [makeAction({ id: 1 })]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={true}
      />,
    )

    expect(screen.getByRole('button', { name: '批准操作 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '拒绝操作 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /批量批准/ })).toBeDisabled()
  })

  it('displays confidence percentage correctly', () => {
    const actions = [makeAction({ confidence: 0.92 })]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    // 百分比由 {Math.round(...)}% 渲染，需要正则匹配
    expect(screen.getByText(/92%/)).toBeInTheDocument()
  })

  it('shows proposed change values and create_category impact note', () => {
    const actions: AgentAction[] = [
      makeAction({
        id: 11,
        action_type: 'create_category',
        risk_level: 'high',
        after_values: { name: '扩散模型' },
      }),
      makeAction({
        id: 12,
        action_type: 'update_tags',
        risk_level: 'low',
        after_values: { tags: ['llm', 'agent'] },
      }),
    ]

    render(
      <AgentProposalList
        actions={actions}
        onApprove={noop}
        onReject={noop}
        onRevert={noop}
        onBatchApprove={noop}
        loading={false}
      />,
    )

    expect(screen.getByText('将新增自定义分类，需逐条确认；批准后会改变分类体系。')).toBeInTheDocument()
    expect(screen.getByText('扩散模型')).toBeInTheDocument()
    expect(screen.getByText('["llm","agent"]')).toBeInTheDocument()
  })
})
