import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { AgentAction, AgentRunResponse, AgentScopeConfig, Category, Paper } from '../../types'
import {
  approveAgentAction,
  batchApproveAgentActions,
  checkHealth,
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
import { normalizeAgentScope } from './agentUtils'

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

const AGENT_REMOTE_AI_CONSENT_KEY = 'agent_remote_ai_consent_v1'
const MAX_SCOPE_PAPERS = 50

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
    desc: '不暴露本地 PDF 路径和密钥；必要上下文会发送到你配置的 AI 服务。',
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

function getPaperMeta(paper: Paper): string {
  const seen = new Set<string>()
  const values = [
    paper.venue?.trim(),
    paper.year ? String(paper.year) : '',
    paper.source?.trim(),
  ].filter(Boolean) as string[]
  const uniqueValues = values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return uniqueValues.length > 0 ? uniqueValues.join(' · ') : '暂无来源信息'
}

function getPaperTags(paper: Paper): string[] {
  return (paper.tags ?? []).filter(Boolean).slice(0, 3)
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

function parseAgentScopeFromLocation(search: string): AgentScopeConfig {
  const params = new URLSearchParams(search)
  const scopeType = params.get('scope') as AgentScopeConfig['scope_type'] | null
  const categoryId = params.get('category_id')
  const paperId = params.get('paper_id')
  const paperIds = params.get('paper_ids')

  if (scopeType === 'category') {
    return normalizeAgentScope({
      scope_type: 'category',
      category_id: categoryId ? Number(categoryId) : null,
    })
  }

  if (scopeType === 'reader_paper') {
    return normalizeAgentScope({
      scope_type: 'reader_paper',
      paper_id: paperId ? Number(paperId) : null,
    })
  }

  if (scopeType === 'papers') {
    const ids = (paperIds ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, MAX_SCOPE_PAPERS)
    return normalizeAgentScope({
      scope_type: 'papers',
      paper_ids: ids,
    })
  }

  return normalizeAgentScope({ scope_type: 'whole_library' })
}

export function AgentWorkspace({ papers = [], categories = [] }: { papers?: Paper[]; categories?: Category[] }) {
  const location = useLocation()
  const [prompt, setPrompt] = useState('')
  const [scope, setScope] = useState<AgentScopeConfig>(() => parseAgentScopeFromLocation(location.search))
  const [thinking, setThinking] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [run, setRun] = useState<AgentRunResponse | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [history, setHistory] = useState<AgentRunResponse[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const [hasRemoteAiConsent, setHasRemoteAiConsent] = useState(false)
  const [remoteAiDetailsOpen, setRemoteAiDetailsOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [embeddingAvailable, setEmbeddingAvailable] = useState<boolean | null>(null)
  const runAbortControllerRef = useRef<AbortController | null>(null)
  const locationScope = useMemo(() => parseAgentScopeFromLocation(location.search), [location.search])

  const sortedPapers = useMemo(
    () => [...papers].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    [papers],
  )
  const selectedPaperIds = scope.paper_ids ?? []
  const selectedPapers = useMemo(
    () => selectedPaperIds.map((paperId) => papers.find((paper) => paper.id === paperId)).filter(Boolean) as Paper[],
    [papers, selectedPaperIds],
  )
  const currentReaderPaper = useMemo(
    () => papers.find((paper) => paper.id === scope.paper_id) ?? null,
    [papers, scope.paper_id],
  )
  const paperSearchResults = useMemo(() => {
    const keyword = paperSearchQuery.trim().toLowerCase()
    return sortedPapers
      .filter((paper) => !selectedPaperIds.includes(paper.id))
      .filter((paper) => {
        if (!keyword) return true
        return [paper.title, paper.source, paper.venue, paper.year ? String(paper.year) : '', ...(paper.tags ?? [])]
          .some((value) => value?.toLowerCase().includes(keyword))
      })
      .slice(0, 10)
  }, [paperSearchQuery, selectedPaperIds, sortedPapers])
  const semanticWarning = useMemo(
    () => run?.tool_events
      .slice()
      .reverse()
      .find((event) => event.tool_name === 'semantic_search' && (event.status === 'warning' || event.status === 'error')) ?? null,
    [run],
  )
  const scopeValidationError = useMemo(() => {
    if (scope.scope_type === 'category' && !scope.category_id) {
      return '请选择一个分类后再运行 Agent。'
    }
    if (scope.scope_type === 'papers' && selectedPaperIds.length === 0) {
      return '请至少选择一篇论文；你可以从论文库多选带入，或在这里搜索后添加。'
    }
    if (scope.scope_type === 'reader_paper' && !scope.paper_id) {
      return '当前阅读论文范围需要一篇目标论文；请从阅读器进入，或在下方手动选择。'
    }
    return ''
  }, [scope, selectedPaperIds.length])

  useEffect(() => {
    setHasRemoteAiConsent(window.localStorage.getItem(AGENT_REMOTE_AI_CONSENT_KEY) === 'accepted')
    checkHealth()
      .then((health) => setEmbeddingAvailable(health.embedding_available))
      .catch(() => setEmbeddingAvailable(null))
  }, [])

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

  useEffect(() => {
    setScope(locationScope)
    setError('')
    if (locationScope.scope_type !== 'papers') {
      setPaperSearchQuery('')
    }
  }, [locationScope])

  function updateScope(nextScope: AgentScopeConfig) {
    const normalized = normalizeAgentScope(nextScope)
    setScope(normalized)
    setError('')
    setStatusMessage('')
    if (normalized.scope_type !== 'papers') {
      setPaperSearchQuery('')
    }
  }

  function applyExample(example: ExamplePrompt) {
    setPrompt(example.prompt)
    if (example.scope === 'category') {
      updateScope({
        scope_type: 'category',
        category_id: scope.category_id ?? categories[0]?.id ?? null,
      })
      return
    }

    if (example.scope === 'reader_paper') {
      // 不伪造“当前阅读论文”：仅保留已有绑定，或提示用户手动选择/从阅读器进入。
      updateScope({
        scope_type: 'reader_paper',
        paper_id: scope.paper_id ?? null,
      })
      return
    }

    if (example.scope === 'papers') {
      updateScope({
        scope_type: 'papers',
        paper_ids: scope.paper_ids ?? [],
      })
      return
    }

    updateScope({ scope_type: 'whole_library' })
  }

  async function submitRun() {
    if (!prompt.trim()) return
    const abortController = new AbortController()
    runAbortControllerRef.current = abortController
    setLoading(true)
    setError('')
    setStatusMessage('')
    setRun(null)
    try {
      const payload: Parameters<typeof createAgentRun>[0] = {
        prompt: prompt.trim(),
        scope: normalizeAgentScope(scope),
      }
      if (thinking) payload.thinking = thinking
      const result = await createAgentRun(payload, { signal: abortController.signal })
      if (abortController.signal.aborted) return
      setRun(result)
      void refreshHistory()
    } catch (err) {
      if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setStatusMessage('已停止等待本次运行结果。')
        return
      }
      setError(err instanceof Error ? err.message : 'Agent 运行失败')
    } finally {
      if (runAbortControllerRef.current === abortController) {
        runAbortControllerRef.current = null
      }
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!hasRemoteAiConsent) return
    await submitRun()
  }

  function handleStopRun() {
    const abortController = runAbortControllerRef.current
    if (!abortController) return
    abortController.abort()
    runAbortControllerRef.current = null
    setLoading(false)
    setError('')
    setStatusMessage('已停止等待本次运行结果。')
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

  async function handleReject(actionId: number, reason: string) {
    setActionLoading(true)
    try {
      const updated = await rejectAgentAction(actionId, reason)
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

  function handleAddPaper(paperId: number) {
    setError('')
    setStatusMessage('')
    const currentIds = scope.paper_ids ?? []
    if (currentIds.includes(paperId)) return
    if (currentIds.length >= MAX_SCOPE_PAPERS) {
      setError(`指定论文范围最多支持 ${MAX_SCOPE_PAPERS} 篇论文，请缩小范围。`)
      return
    }
    setScope(normalizeAgentScope({
      scope_type: 'papers',
      paper_ids: [...currentIds, paperId],
    }))
  }

  function handleRemovePaper(paperId: number) {
    setError('')
    setScope((current) => normalizeAgentScope({
      ...current,
      paper_ids: (current.paper_ids ?? []).filter((id) => id !== paperId),
    }))
  }

  function handleClearSelectedPapers() {
    updateScope({ scope_type: 'papers', paper_ids: [] })
  }

  function handleRemoteAiConsentChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.checked) return
    window.localStorage.setItem(AGENT_REMOTE_AI_CONSENT_KEY, 'accepted')
    setHasRemoteAiConsent(true)
    setStatusMessage('')
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

          <section className="agent-disclosure-card" aria-label="AI 服务使用边界">
            <div className="agent-disclosure-head">
              <strong>AI 服务使用边界</strong>
              <button
                type="button"
                className="agent-disclosure-link"
                onClick={() => setRemoteAiDetailsOpen((open) => !open)}
                aria-expanded={remoteAiDetailsOpen}
              >
                {remoteAiDetailsOpen ? '收起说明' : '查看详情'}
              </button>
            </div>
            <p>
              运行 Agent 会调用你已配置的 AI 服务，只发送本次任务所需的论文摘要、标题、标签和分类等上下文；
              本地 PDF 路径、密钥不会发送。所有写入仍需你确认。
            </p>
            {remoteAiDetailsOpen && (
              <ul className="agent-disclosure-details">
                <li>首次勾选会记录在当前浏览器和设备上，后续运行不再反复打断。</li>
                <li>你可以在 AI 供应商设置中更换或停用远端服务。</li>
                <li>Agent 只生成提案；标签、分类、元数据等写入都需要你批准。</li>
              </ul>
            )}
            {embeddingAvailable === false && (
              <p className="agent-disclosure-warning">当前向量化不可用，宽范围任务会自动降级为非语义分析，结果精度可能下降。</p>
            )}
          </section>

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
              <AgentScopePicker categories={categories} scope={scope} onChange={updateScope} />
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

            {scopeValidationError && (
              <p className="agent-scope-validation" role="status">
                <Icon name="warning" aria-hidden="true" />
                <span>{scopeValidationError}</span>
              </p>
            )}

            {scope.scope_type === 'papers' && (
              <section className="agent-scope-panel" aria-label="指定论文范围编辑器">
                <div className="agent-scope-panel-head">
                  <div>
                    <p className="agent-scope-eyebrow">操作范围</p>
                    <h4>指定论文范围</h4>
                  </div>
                  <div className="agent-scope-head-actions">
                    <span className="agent-scope-count">已选 {selectedPapers.length}/{MAX_SCOPE_PAPERS}</span>
                    {selectedPapers.length > 0 && (
                      <button type="button" className="agent-scope-ghost-btn" onClick={handleClearSelectedPapers}>
                        清空
                      </button>
                    )}
                  </div>
                </div>

                <div className="agent-paper-search">
                  <label htmlFor="agent-paper-search-input">添加论文</label>
                  <div className="agent-paper-search-input">
                    <Icon name="search" aria-hidden="true" />
                    <input
                      id="agent-paper-search-input"
                      type="search"
                      value={paperSearchQuery}
                      onChange={(event) => setPaperSearchQuery(event.target.value)}
                      placeholder="搜索标题、来源、年份或标签"
                      aria-label="搜索可添加论文"
                    />
                  </div>
                </div>

                <div className="agent-selected-paper-zone" aria-label="已选论文">
                  {selectedPapers.length === 0 ? (
                    <div className="agent-scope-empty">
                      <Icon name="library" aria-hidden="true" />
                      <div>
                        <strong>尚未选择论文</strong>
                        <p>从论文库带入多选结果，或在上方搜索后加入本次 Agent 范围。</p>
                      </div>
                    </div>
                  ) : (
                    <ul className="agent-selected-paper-list">
                      {selectedPapers.map((paper) => {
                        const tags = getPaperTags(paper)
                        return (
                          <li key={paper.id} className="agent-selected-paper-row">
                            <span className="agent-paper-row-icon" aria-hidden="true">
                              <Icon name="fileText" />
                            </span>
                            <div className="agent-paper-row-body">
                              <strong className="agent-paper-title">{paper.title}</strong>
                              <span className="agent-paper-meta">{getPaperMeta(paper)}</span>
                              {tags.length > 0 && (
                                <span className="agent-paper-tags" aria-label={`${paper.title} 标签`}>
                                  {tags.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="agent-paper-icon-btn"
                              onClick={() => handleRemovePaper(paper.id)}
                              aria-label={`移除 ${paper.title}`}
                              title="移除"
                            >
                              <Icon name="close" aria-hidden="true" />
                              <span className="visually-hidden">移除</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className="agent-paper-candidate-block">
                  <div className="agent-paper-candidate-head">
                    <span>可添加论文</span>
                    <small>{paperSearchQuery.trim() ? '最多显示 10 条匹配结果' : '论文库中未选中的论文'}</small>
                  </div>
                  {paperSearchResults.length > 0 ? (
                    <ul className="agent-paper-candidate-list">
                      {paperSearchResults.map((paper) => {
                        const tags = getPaperTags(paper)
                        return (
                          <li key={paper.id} className="agent-paper-candidate">
                            <div className="agent-paper-row-body">
                              <strong className="agent-paper-title">{paper.title}</strong>
                              <span className="agent-paper-meta">{getPaperMeta(paper)}</span>
                              {tags.length > 0 && (
                                <span className="agent-paper-tags" aria-label={`${paper.title} 标签`}>
                                  {tags.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="agent-scope-action-btn"
                              onClick={() => handleAddPaper(paper.id)}
                              aria-label={`添加 ${paper.title} 到指定论文范围`}
                            >
                              添加
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : paperSearchQuery.trim() ? (
                    <p className="agent-scope-search-empty">没有匹配的论文，可回到论文库重新多选或换个关键词。</p>
                  ) : (
                    <p className="agent-paper-candidate-empty">输入关键词后按标题、来源、年份或标签筛选。</p>
                  )}
                </div>
              </section>
            )}

            {scope.scope_type === 'reader_paper' && (
              <section className="agent-scope-panel agent-reader-scope-panel" aria-label="当前阅读论文范围说明">
                <div className="agent-scope-panel-head">
                  <div>
                    <p className="agent-scope-eyebrow">操作范围</p>
                    <h4>当前阅读论文</h4>
                  </div>
                  <span className="agent-scope-count">单篇论文</span>
                </div>

                <div className={currentReaderPaper ? 'agent-reader-paper-summary' : 'agent-reader-paper-summary is-empty'}>
                  <span className="agent-reader-paper-icon" aria-hidden="true">
                    <Icon name={currentReaderPaper ? 'book' : 'warning'} />
                  </span>
                  <div className="agent-reader-paper-body">
                    <span className="agent-reader-status">{currentReaderPaper ? '当前绑定论文' : '未绑定论文'}</span>
                    <strong>
                      {currentReaderPaper
                        ? `当前绑定论文：${currentReaderPaper.title}`
                        : '当前没有从阅读器带入论文'}
                    </strong>
                    <p>
                      {currentReaderPaper
                        ? getPaperMeta(currentReaderPaper)
                        : '可以先从阅读器进入 Agent，或在下方手动选择一篇论文作为当前范围。'}
                    </p>
                    {currentReaderPaper && getPaperTags(currentReaderPaper).length > 0 && (
                      <span className="agent-paper-tags" aria-label={`${currentReaderPaper.title} 标签`}>
                        {getPaperTags(currentReaderPaper).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>

                <label className="agent-reader-switcher">
                  <span>更换论文</span>
                  <select
                    value={scope.paper_id ?? ''}
                    onChange={(event) => updateScope({ scope_type: 'reader_paper', paper_id: event.target.value ? Number(event.target.value) : null })}
                    aria-label="当前阅读论文"
                  >
                    <option value="">选择论文</option>
                    {sortedPapers.map((paper) => (
                      <option key={paper.id} value={paper.id}>
                        {paper.title}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}

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

            {!hasRemoteAiConsent && (
              <label className="agent-inline-consent">
                <input
                  type="checkbox"
                  onChange={handleRemoteAiConsentChange}
                />
                <span>我了解本次运行会调用已配置的 AI 服务，并只发送任务所需上下文。</span>
              </label>
            )}

            <div className="agent-submit-row">
              <button
                type="button"
                className="agent-submit-btn"
                disabled={loading || !prompt.trim() || Boolean(scopeValidationError) || !hasRemoteAiConsent}
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
              {loading && (
                <button
                  type="button"
                  className="agent-stop-btn"
                  onClick={handleStopRun}
                  aria-label="停止当前 Agent 运行"
                >
                  <Icon name="close" aria-hidden="true" />
                  停止
                </button>
              )}
              <span className="agent-submit-note">
                <Icon name="check" aria-hidden="true" />
                只生成待确认提案；运行会使用你配置的 AI 服务。
              </span>
            </div>
          </section>

          {statusMessage && (
            <div className="agent-status" role="status">
              <Icon name="check" aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          )}

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
                <li>确认偏好设置中的 AI 供应商 API Key 已配置，或后端环境变量仍可作为回退。</li>
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

          {semanticWarning && !runFailed && (
            <div className="agent-error" role="status">
              <Icon name="warning" aria-hidden="true" />
              <span>{semanticWarning.error_message || '语义检索不可用，已退化为非语义分析。'}</span>
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
