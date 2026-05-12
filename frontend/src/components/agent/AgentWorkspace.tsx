import { useCallback, useEffect, useState } from 'react'
import type { AgentAction, AgentRunResponse, AgentScopeConfig } from '../../types'
import {
  approveAgentAction,
  batchApproveAgentActions,
  createAgentRun,
  fetchAgentRunDetail,
  fetchAgentRuns,
  rejectAgentAction,
  revertAgentAction,
} from '../../lib/api'
import { Icon } from '../UiIcon'
import type { IconName } from '../UiIcon'
import { AgentScopePicker } from './AgentScopePicker'
import { AgentTracePanel } from './AgentTracePanel'
import { AgentProposalList } from './AgentProposalList'

type CapabilityCard = {
  icon: IconName
  title: string
  desc: string
}

type ExamplePrompt = {
  label: string
  prompt: string
  scope: AgentScopeConfig['scope_type']
}

const CAPABILITIES: CapabilityCard[] = [
  {
    icon: 'search',
    title: '按语义检索论文',
    desc: '用中文描述主题，Agent 基于向量搜索从整库匹配，不靠关键字。',
  },
  {
    icon: 'target',
    title: '建议分类与标签',
    desc: '阅读摘要后提出「加标签 / 改分类 / 标记优先阅读」等变更建议。',
  },
  {
    icon: 'check',
    title: '人工确认后执行',
    desc: '所有写操作都先生成提案，经你逐条或批量批准才落盘，可撤销。',
  },
  {
    icon: 'fileText',
    title: '只读访问论文',
    desc: '不暴露本地 PDF 路径和密钥，不调用外部网络，数据不出本机。',
  },
]

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    label: '找出所有与强化学习相关的未读论文',
    prompt: '帮我找出所有未读论文中与强化学习相关的，并标记为优先阅读。',
    scope: 'whole_library',
  },
  {
    label: '给无标签论文补充主题标签',
    prompt: '浏览当前分类下没有标签的论文，根据摘要建议 1-3 个主题标签。',
    scope: 'category',
  },
  {
    label: '把今年 arXiv 论文按方法归类',
    prompt: '列出 2026 年 arXiv 来源的论文，按方法类型（扩散 / Transformer / 强化学习 / 其他）分组。',
    scope: 'whole_library',
  },
  {
    label: '总结当前阅读论文的核心贡献',
    prompt: '总结我当前阅读的这篇论文核心贡献与方法差异，并建议合适的分类与标签。',
    scope: 'reader_paper',
  },
]

const SCOPE_LABELS: Record<AgentScopeConfig['scope_type'], string> = {
  whole_library: '全部论文库',
  category: '特定分类',
  papers: '指定论文',
  reader_paper: '当前阅读论文',
}

function formatRunTime(iso: string): string {
  if (!iso) return '--'
  const raw = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return '--'
  const now = new Date()
  const sameDay = parsed.toDateString() === now.toDateString()
  if (sameDay) {
    return `今天 ${parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  return parsed.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getRunStatusLabel(status: string): { label: string; tone: 'ok' | 'warn' | 'err' | 'info' } {
  switch (status) {
    case 'completed':
      return { label: '已完成', tone: 'ok' }
    case 'failed':
      return { label: '失败', tone: 'err' }
    case 'running':
      return { label: '运行中', tone: 'info' }
    case 'pending':
      return { label: '排队中', tone: 'info' }
    default:
      return { label: status || '未知', tone: 'warn' }
  }
}

function truncate(text: string, max = 48): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function getRunErrorMessage(run: AgentRunResponse): string {
  const runnerError = run.tool_events
    .slice()
    .reverse()
    .find((e) => e.tool_name === 'agent_runner' && e.status === 'error')
  if (runnerError?.error_message) return runnerError.error_message
  const anyError = run.tool_events
    .slice()
    .reverse()
    .find((e) => e.status === 'error' && e.error_message)
  return anyError?.error_message ?? ''
}

export function AgentWorkspace() {
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<AgentScopeConfig>({ scope_type: 'whole_library' })
  const [thinking, setThinking] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [run, setRun] = useState<AgentRunResponse | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [history, setHistory] = useState<AgentRunResponse[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const runs = await fetchAgentRuns()
      setHistory(runs)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '加载历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  function applyExample(example: ExamplePrompt) {
    setPrompt(example.prompt)
    setScope((prev) => ({ ...prev, scope_type: example.scope }))
  }

  async function handleSubmit() {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    setRun(null)
    try {
      const payload: Parameters<typeof createAgentRun>[0] = {
        prompt: prompt.trim(),
        scope,
      }
      if (thinking) payload.thinking = thinking
      const result = await createAgentRun(payload)
      setRun(result)
      void refreshHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent 运行失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectHistory(runId: number) {
    if (run?.id === runId) return
    setActionLoading(true)
    setError('')
    try {
      const detail = await fetchAgentRunDetail(runId)
      setRun(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载运行详情失败')
    } finally {
      setActionLoading(false)
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
      const updatedRun = await fetchAgentRunDetail(run.id)
      setRun(updatedRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量批准失败')
    } finally {
      setActionLoading(false)
    }
  }

  const hasRun = run !== null
  const runFailed = run?.status === 'failed'
  const runErrorMessage = run ? getRunErrorMessage(run) : ''
  const runHasNoActions = Boolean(run && run.status === 'completed' && run.actions.length === 0)

  return (
    <div className="agent-workspace" data-testid="agent-workspace">
      <div className="agent-workspace-grid">
        <div className="agent-workspace-main">
          {!hasRun && !loading && (
            <section className="agent-intro" aria-label="Agent 能力说明">
              <div className="agent-intro-lead">
                <h2>把重复整理的活交给 Agent</h2>
                <p>
                  用一句话描述你希望整理论文库的方式，Agent 会读取你选定范围内的论文、调用语义检索与分类工具，
                  给出一组可逐条确认的变更建议。所有写操作都需要你批准才会落盘。
                </p>
              </div>
              <ul className="agent-capability-grid">
                {CAPABILITIES.map((cap) => (
                  <li key={cap.title} className="agent-capability-card">
                    <span className="agent-capability-icon" aria-hidden="true">
                      <Icon name={cap.icon} />
                    </span>
                    <div>
                      <h3>{cap.title}</h3>
                      <p>{cap.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="agent-prompt-card" aria-label="Agent 输入区">
            <div className="agent-prompt-card-head">
              <h3>
                <Icon name="spark" aria-hidden="true" />
                描述你希望 Agent 完成的任务
              </h3>
              <span className="agent-prompt-card-hint">
                运行前请先选定操作范围，结果会先以「提案」形式呈现
              </span>
            </div>

            <div className="agent-prompt-controls">
              <AgentScopePicker scope={scope} onChange={setScope} />
              <div className="agent-thinking-control">
                <label htmlFor="agent-thinking">思考强度</label>
                <select
                  id="agent-thinking"
                  value={thinking}
                  onChange={(e) => setThinking(e.target.value)}
                >
                  <option value="">系统默认 (high)</option>
                  <option value="none">关闭思考</option>
                  <option value="low">低（快速）</option>
                  <option value="medium">中</option>
                  <option value="high">高（深度）</option>
                </select>
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：「帮我找出所有未读论文中与强化学习相关的，并标记为优先阅读」"
              aria-label="Agent 提示词"
              disabled={loading}
              rows={4}
            />

            {!hasRun && (
              <div className="agent-example-row" role="group" aria-label="示例任务">
                <span className="agent-example-label">试试这些：</span>
                <div className="agent-example-chips">
                  {EXAMPLE_PROMPTS.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      className="agent-example-chip"
                      onClick={() => applyExample(example)}
                      disabled={loading}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="agent-submit-row">
              <button
                type="button"
                className="agent-submit-btn"
                disabled={loading || !prompt.trim()}
                onClick={handleSubmit}
                aria-label="运行 Agent"
              >
                {loading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Agent 正在分析你的论文库...
                  </>
                ) : (
                  <>
                    <Icon name="send" aria-hidden="true" />
                    运行 Agent
                  </>
                )}
              </button>
              <span className="agent-submit-note">
                <Icon name="check" aria-hidden="true" />
                所有变更需你确认后才会落盘
              </span>
            </div>
          </section>

          {error && (
            <div className="agent-error" role="alert">
              <Icon name="warning" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {loading && !hasRun && (
            <div className="agent-running-placeholder" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>Agent 正在工作</strong>
                <p>正在读取论文库、调用分析工具并整理建议，通常需要 10–40 秒。</p>
              </div>
            </div>
          )}

          {runFailed && (
            <div className="agent-run-failed" role="alert">
              <div className="agent-run-failed-head">
                <Icon name="warning" aria-hidden="true" />
                <div>
                  <strong>Agent 运行失败</strong>
                  <p>{runErrorMessage || '未返回明确错误信息，请查看工具调用追踪。'}</p>
                </div>
              </div>
              <ul className="agent-run-failed-tips">
                <li>确认 <code>DEEPSEEK_API_KEY</code> 已在 <code>backend/.env</code> 中配置。</li>
                <li>检查后端日志（<code>uvicorn</code> 输出）查看完整堆栈。</li>
                <li>若是 JSON 解析错误，可重试一次或把 prompt 简化后再运行。</li>
              </ul>
            </div>
          )}

          {runHasNoActions && !runFailed && (
            <div className="agent-run-empty" role="status">
              <Icon name="check" aria-hidden="true" />
              <div>
                <strong>Agent 没有生成任何操作建议</strong>
                <p>
                  可能是因为你的论文库已经很整齐，或者 prompt 对当前范围没有可执行的改动。
                  试着缩小范围、换一种提问方式，或者换个思考强度再运行一次。
                </p>
              </div>
            </div>
          )}

          {run && (
            <>
              <AgentTracePanel events={run.tool_events} />
              {run.actions.length > 0 && (
                <AgentProposalList
                  actions={run.actions}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onRevert={handleRevert}
                  onBatchApprove={handleBatchApprove}
                  loading={actionLoading}
                />
              )}
            </>
          )}
        </div>

        <aside className="agent-history" aria-label="Agent 运行历史">
          <div className="agent-history-head">
            <h3>最近运行</h3>
            <button
              type="button"
              className="agent-history-refresh"
              onClick={() => void refreshHistory()}
              disabled={historyLoading}
              aria-label="刷新历史"
            >
              <Icon name="refresh" aria-hidden="true" />
            </button>
          </div>

          {historyError && (
            <p className="agent-history-error">{historyError}</p>
          )}

          {historyLoading && history.length === 0 && (
            <p className="agent-history-loading">正在加载历史...</p>
          )}

          {!historyLoading && history.length === 0 && !historyError && (
            <p className="agent-history-empty">还没有运行记录。点击「运行 Agent」创建第一条。</p>
          )}

          {history.length > 0 && (
            <ul className="agent-history-list">
              {history.map((item) => {
                const statusInfo = getRunStatusLabel(item.status)
                const isActive = run?.id === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`agent-history-item ${isActive ? 'is-active' : ''}`}
                      onClick={() => void handleSelectHistory(item.id)}
                    >
                      <div className="agent-history-item-row">
                        <span className={`agent-history-status agent-history-status--${statusInfo.tone}`}>
                          {statusInfo.label}
                        </span>
                        <span className="agent-history-time">{formatRunTime(item.created_at)}</span>
                      </div>
                      <p className="agent-history-prompt" title={item.prompt}>
                        {truncate(item.prompt, 60) || '（空 prompt）'}
                      </p>
                      <div className="agent-history-meta">
                        <span>{SCOPE_LABELS[item.scope.scope_type] ?? item.scope.scope_type}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.actions.length} 条建议</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
