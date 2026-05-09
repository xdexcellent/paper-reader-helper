import { useState } from 'react'
import type { AgentAction, AgentRunResponse, AgentScopeConfig } from '../../types'
import { createAgentRun, approveAgentAction, batchApproveAgentActions, rejectAgentAction, revertAgentAction } from '../../lib/api'
import { AgentScopePicker } from './AgentScopePicker'
import { AgentTracePanel } from './AgentTracePanel'
import { AgentProposalList } from './AgentProposalList'

export function AgentWorkspace() {
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<AgentScopeConfig>({ scope_type: 'whole_library' })
  const [thinking, setThinking] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [run, setRun] = useState<AgentRunResponse | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  async function handleSubmit() {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    setRun(null)
    try {
      const result = await createAgentRun({
        prompt: prompt.trim(),
        scope,
        thinking,
      })
      setRun(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent 运行失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(actionId: number) {
    setActionLoading(true)
    try {
      const updated = await approveAgentAction(actionId)
      if (run) {
        setRun({
          ...run,
          actions: run.actions.map((a: AgentAction) => (a.id === actionId ? updated : a)),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '批准操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject(actionId: number) {
    setActionLoading(true)
    try {
      const updated = await rejectAgentAction(actionId)
      if (run) {
        setRun({
          ...run,
          actions: run.actions.map((a: AgentAction) => (a.id === actionId ? updated : a)),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '拒绝操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRevert(actionId: number) {
    setActionLoading(true)
    try {
      const updated = await revertAgentAction(actionId)
      if (run) {
        setRun({
          ...run,
          actions: run.actions.map((a: AgentAction) => (a.id === actionId ? updated : a)),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBatchApprove(actionIds: number[]) {
    if (!run) return
    setActionLoading(true)
    try {
      await batchApproveAgentActions(run.id, actionIds)
      // Refresh run data
      const { fetchAgentRunDetail } = await import('../../lib/api')
      const updatedRun = await fetchAgentRunDetail(run.id)
      setRun(updatedRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量批准失败')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="agent-workspace" data-testid="agent-workspace">
      <div className="agent-prompt-area">
        <AgentScopePicker scope={scope} onChange={setScope} />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label htmlFor="agent-thinking" style={{ fontSize: '0.85rem', opacity: 0.8 }}>思考强度</label>
          <select
            id="agent-thinking"
            value={thinking}
            onChange={(e) => setThinking(e.target.value)}
            style={{ flex: '0 0 auto' }}
          >
            <option value="">系统默认 (high)</option>
            <option value="none">关闭思考</option>
            <option value="low">低 (快速)</option>
            <option value="medium">中</option>
            <option value="high">高 (深度)</option>
          </select>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你希望 Agent 帮你完成的操作，例如：「帮我找出所有未读论文中与强化学习相关的，并标记为优先阅读」"
          aria-label="Agent 提示词"
          disabled={loading}
        />
        <button
          type="button"
          disabled={loading || !prompt.trim()}
          onClick={handleSubmit}
          aria-label="运行 Agent"
        >
          {loading ? 'Agent 正在分析你的论文库...' : '运行 Agent'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ color: 'var(--color-danger, #ef4444)', padding: '0.5rem' }}>
          {error}
        </div>
      )}

      {run && (
        <>
          <AgentTracePanel events={run.tool_events} />
          <AgentProposalList
            actions={run.actions}
            onApprove={handleApprove}
            onReject={handleReject}
            onRevert={handleRevert}
            onBatchApprove={handleBatchApprove}
            loading={actionLoading}
          />
        </>
      )}
    </div>
  )
}
