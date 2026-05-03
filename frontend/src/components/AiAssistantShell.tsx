import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  createChatSession,
  fetchChatSessions,
  fetchChatSessionDetail,
  deleteChatSession,
  sendSessionMessage,
  semanticSearch,
  uploadPaper,
  type ChatSessionResponse,
  type SemanticSearchResult,
} from '../lib/api'
import type { Paper } from '../types'
import { Icon, type IconName } from './UiIcon'

interface LocalMessage {
  role: 'user' | 'assistant'
  content: string
}

const MODELS = [
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
]

const WELCOME_MESSAGE: LocalMessage = {
  role: 'assistant',
  content: '已进入研究助手工作区。关联论文后可以直接提问，也可以使用下方快捷任务开始分析。'
}

const QUICK_QUESTIONS: Array<{ icon: IconName; text: string; detail: string; full: string }> = [
  { icon: 'chart', text: '总结我论文库中的研究方向', detail: '生成主题聚类与热点概览', full: '请帮我总结一下我论文库中所有论文的研究方向和主题分布。' },
  { icon: 'microscope', text: '分析方法论', detail: '拆解核心方法、创新点与实验设计', full: '请帮我详细分析当前关联论文的研究方法论，包括技术路线、实验设计和创新点。' },
  { icon: 'fileText', text: '写文献综述段落', detail: '输出可直接改写的综述草稿', full: '请基于我论文库中的论文，帮我撰写一段文献综述，涵盖主要研究进展和发展趋势。' },
  { icon: 'warning', text: '指出不足之处', detail: '从实验、论证和泛化性角度批判', full: '请帮我分析当前关联论文的局限性、不足之处以及未来可以改进的方向。' },
]

const CHAT_MODES = ['论文解读', '方法分析', '文献综述', '审稿批判'] as const
const ANSWER_STYLES = ['简洁', '学术', '审稿式'] as const
const OUTPUT_FORMATS = ['列表', '表格', '段落'] as const

export function AiAssistantShell({ papers }: { papers: Paper[] }) {
  const [sessions, setSessions] = useState<ChatSessionResponse[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<LocalMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value)
  const [localUploadedPapers, setLocalUploadedPapers] = useState<Paper[]>([])
  const [isUploadingPaper, setIsUploadingPaper] = useState(false)
  const [chatMode, setChatMode] = useState<(typeof CHAT_MODES)[number]>('论文解读')
  const [answerStyle, setAnswerStyle] = useState<(typeof ANSWER_STYLES)[number]>('学术')
  const [outputFormat, setOutputFormat] = useState<(typeof OUTPUT_FORMATS)[number]>('列表')
  const [deepAnalysis, setDeepAnalysis] = useState(true)
  const [paperOnly, setPaperOnly] = useState(false)
  const [semanticQuery, setSemanticQuery] = useState('')
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([])
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageCache = useRef<Map<number, LocalMessage[]>>(new Map())

  async function handleSemanticSearch() {
    if (!semanticQuery.trim()) return
    setIsSearchingSemantic(true)
    try {
      const results = await semanticSearch(semanticQuery.trim())
      setSemanticResults(results)
    } catch {
      setSemanticResults([])
    } finally {
      setIsSearchingSemantic(false)
    }
  }

  async function handleUploadPaper(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setIsUploadingPaper(true)
    try {
      const paper = await uploadPaper({ source: 'assistant-upload', file })
      setLocalUploadedPapers(prev => [paper, ...prev.filter(item => item.id !== paper.id)])
      setSelectedPaperId(paper.id)
      setInput(prev => prev || `请基于刚上传的论文《${paper.title}》进行解读。`)
    } catch {
      setInput(prev => prev || 'PDF 上传失败，请稍后重试或前往论文管理页面上传。')
    } finally {
      setIsUploadingPaper(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  useEffect(() => {
    if (!selectedPaperId && paperOnly) {
      setPaperOnly(false)
    }
  }, [paperOnly, selectedPaperId])

  async function loadSessions() {
    setIsLoadingSessions(true)
    try {
      const list = await fetchChatSessions()
      setSessions(list)
      if (list.length > 0 && !activeSessionId) {
        await switchToSession(list[0].id)
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingSessions(false)
    }
  }

  async function switchToSession(id: number) {
    setActiveSessionId(id)
    // Check cache
    if (messageCache.current.has(id)) {
      setMessages(messageCache.current.get(id)!)
      // restore paper_id / model from session
      const s = sessions.find(s => s.id === id)
      if (s) {
        setSelectedPaperId(s.paper_id)
        setSelectedModel(s.model)
      }
      return
    }

    try {
      const detail = await fetchChatSessionDetail(id)
      setSelectedPaperId(detail.paper_id)
      setSelectedModel(detail.model)
      const msgs: LocalMessage[] = detail.messages.length > 0
        ? detail.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        : [WELCOME_MESSAGE]
      setMessages(msgs)
      messageCache.current.set(id, msgs)
    } catch {
      setMessages([WELCOME_MESSAGE])
    }
  }

  async function handleNewChat() {
    try {
      const newSession = await createChatSession({
        title: '新对话',
        paper_id: selectedPaperId,
        model: selectedModel,
      })
      setSessions(prev => [newSession, ...prev])
      setActiveSessionId(newSession.id)
      setMessages([WELCOME_MESSAGE])
      messageCache.current.set(newSession.id, [WELCOME_MESSAGE])
      setInput('')
    } catch {
      // Ignore
    }
  }

  async function handleDeleteSession(id: number) {
    try {
      await deleteChatSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      messageCache.current.delete(id)
      if (activeSessionId === id) {
        const remaining = sessions.filter(s => s.id !== id)
        if (remaining.length > 0) {
          await switchToSession(remaining[0].id)
        } else {
          setActiveSessionId(null)
          setMessages([WELCOME_MESSAGE])
        }
      }
    } catch {
      // Ignore
    }
  }

  const handleSubmit = useCallback(async (messageText?: string) => {
    const text = (messageText || input).trim()
    if (!text || isLoading || !activeSessionId) return

    setInput('')
    const userMsg: LocalMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    const requestText = [
      `会话模式：${chatMode}`,
      `回答风格：${answerStyle}`,
      `输出格式：${outputFormat}`,
      `分析深度：${deepAnalysis ? '深度分析' : '常规回答'}`,
      `依据范围：${paperOnly ? '仅基于当前论文和已关联上下文回答，不足则明确说明' : '可结合论文库与通用学术知识回答'}`,
      '',
      text,
    ].join('\n')

    setIsLoading(true)
    try {
      const { reply } = await sendSessionMessage(activeSessionId, requestText, selectedPaperId, selectedModel)
      const finalMessages = [...updatedMessages, { role: 'assistant' as const, content: reply }]
      setMessages(finalMessages)
      messageCache.current.set(activeSessionId, finalMessages)

      // Update session title and context in local state
      setSessions(prev =>prev.map(s => {
        if (s.id !== activeSessionId) return s
        const isFirst = updatedMessages.filter(m => m.role === 'user').length === 1
        return {
          ...s,
          title: isFirst ? text.slice(0, 25) + (text.length > 25 ? '…' : '') : s.title,
          paper_id: selectedPaperId,
          model: selectedModel
        }
      }))
    } catch (error) {
      const errMsg: LocalMessage = {
        role: 'assistant',
        content: error instanceof Error ? `错误：${error.message}` : '抱歉，系统出现错误，请稍后重试。'
      }
      const finalMessages = [...updatedMessages, errMsg]
      setMessages(finalMessages)
      messageCache.current.set(activeSessionId, finalMessages)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, activeSessionId, messages, selectedPaperId, selectedModel, chatMode, answerStyle, outputFormat, deepAnalysis, paperOnly])

  // Auto-create session if none exists
  useEffect(() => {
    if (!isLoadingSessions && sessions.length === 0 && !activeSessionId) {
      handleNewChat()
    }
  }, [isLoadingSessions, sessions.length])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSubmit()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const allPapers = [
    ...localUploadedPapers,
    ...papers.filter(paper => !localUploadedPapers.some(localPaper => localPaper.id === paper.id)),
  ]
  const selectedPaperTitle = selectedPaperId
    ? allPapers.find(p => p.id === selectedPaperId)?.title
    : null
  const selectedModelLabel = MODELS.find(m => m.value === selectedModel)?.label ?? selectedModel
  const contextScope = selectedPaperId
    ? paperOnly ? '仅当前论文' : '当前论文 + 论文库'
    : '论文库 + 通用知识'

  const getSessionPaperTitle = (paperId: number | null) => {
    if (!paperId) return '未关联论文'
    return allPapers.find(p => p.id === paperId)?.title ?? '关联论文 1 篇'
  }

  const getSessionSummary = (session: ChatSessionResponse) => {
    if (session.title === '新对话') return '准备开始新的论文问答'
    return `讨论了${session.paper_id ? '当前论文' : '论文库'}的研究问题`
  }

  const filteredSessions = sessions.filter(session => {
    const keyword = historyQuery.trim().toLowerCase()
    if (!keyword) return true
    return [
      session.title,
      session.model,
      getSessionPaperTitle(session.paper_id),
      getSessionSummary(session),
    ].some(value => value.toLowerCase().includes(keyword))
  })

  const insertCurrentPaperReference = () => {
    const reference = selectedPaperTitle
      ? `请基于当前关联论文《${selectedPaperTitle}》回答：`
      : '请先选择一篇关联论文，然后基于该论文回答：'
    setInput(prev => prev ? `${prev}\n${reference}` : reference)
    inputRef.current?.focus()
  }

  const showQuickQuestions = messages.length <= 1

  return (
    <div className="workspace-content-grid ai-assistant-shell">
      {/* 会话侧栏 */}
      <aside className="reading-list-panel assistant-session-sidebar">
        <header className="assistant-history-header">
          <div>
            <h2>对话历史</h2>
            <p>按论文和任务回找研究记录</p>
          </div>
          <button type="button" onClick={handleNewChat}>+ 新建对话</button>
        </header>
        <ul>
          {filteredSessions.map(session => (
            <li
              key={session.id}
              className={session.id === activeSessionId ? 'active' : ''}
              onClick={() => switchToSession(session.id)}
            >
              <div className="assistant-history-title">{session.title}</div>
              <div className="assistant-history-meta">
                <span>{new Date(session.updated_at || session.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                <span>{session.model}</span>
                <span>关联论文 {session.paper_id ? 1 : 0} 篇</span>
              </div>
              <p className="assistant-history-summary">{getSessionSummary(session)}</p>
              <div className="assistant-history-paper">{getSessionPaperTitle(session.paper_id)}</div>
              <div className="assistant-history-tags">
                <span>{session.paper_id ? '方法分析' : '文献综述'}</span>
                <span>最近更新</span>
              </div>
              <button
                type="button"
                className="chat-session-delete"
                onClick={e => { e.stopPropagation(); handleDeleteSession(session.id) }}
                title="删除会话"
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
          {filteredSessions.length === 0 && (
            <li className="assistant-history-empty">没有匹配的历史会话</li>
          )}
        </ul>
        <div className="assistant-history-filter">
          <label htmlFor="assistant-history-search">筛选历史</label>
          <input
            id="assistant-history-search"
            placeholder="搜索标题、论文或任务标签"
            value={historyQuery}
            onChange={event => setHistoryQuery(event.target.value)}
          />
        </div>
      </aside>

      {/* 主对话区 */}
      <main className="assistant-chat-main">
        <header className="assistant-chat-header">
          <div className="chat-session-bar">
            <div className="chat-session-main">
              <span>会话上下文</span>
              <strong>{selectedPaperTitle ?? '未关联论文 · 通用研究问答'}</strong>
              <small>{chatMode} · {selectedModelLabel} · {contextScope}</small>
            </div>
            <div className="chat-session-controls">
              <label>
                <span>模式</span>
                <select
                  value={chatMode}
                  onChange={e => setChatMode(e.target.value as (typeof CHAT_MODES)[number])}
                >
                  {CHAT_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>模型</span>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                >
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <span className="chat-status-pill">在线</span>
            </div>
          </div>

          <details className="chat-resource-details">
            <summary><Icon name="search" /> 更换或搜索论文上下文</summary>
            <section className="chat-resource-row" aria-label="论文资源">
              <label className="chat-control-group">
                <span className="chat-control-label">关联论文</span>
                <select
                  className="chat-select"
                  value={selectedPaperId ?? ''}
                  onChange={e => setSelectedPaperId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">不关联 · 通用问答</option>
                  {allPapers.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
              <div className="semantic-search-section">
                <span className="chat-control-label">论文库检索</span>
                <div className="semantic-search-bar">
                  <input
                    className="paper-search-input"
                    placeholder="搜索论文库并设为当前上下文"
                    value={semanticQuery}
                    onChange={e => setSemanticQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
                  />
                  <button
                    className="btn-primary semantic-search-btn"
                    onClick={handleSemanticSearch}
                    disabled={isSearchingSemantic || !semanticQuery.trim()}
                    aria-label="语义搜索"
                  >
                    <Icon name="search" />
                  </button>
                </div>
              </div>
            </section>
            {semanticResults.length > 0 && (
              <div className="semantic-results">
                {semanticResults.map(r => (
                  <button
                    type="button"
                    key={r.paper.id}
                    className="semantic-result-item"
                    onClick={() => setSelectedPaperId(r.paper.id)}
                  >
                    <span className="semantic-result-copy">
                      <strong>{r.paper.title}</strong>
                      {(r.paper.tags ?? []).length > 0 && (
                        <span className="semantic-result-tags">
                          {r.paper.tags!.map(t => <em key={t}>{t}</em>)}
                        </span>
                      )}
                    </span>
                    <span className="semantic-result-score">{(r.similarity * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            )}
          </details>

          <div className="chat-context-note">
            <Icon name="paperclip" />
            <span>来源：{selectedPaperId ? '当前论文 / 论文库 / 当前会话' : '论文库 / 通用学术知识 / 当前会话'}</span>
          </div>
        </header>

        <div className="chat-messages-scroll-area">
          <div className="chat-messages-container">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble-wrap ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-avatar ai-avatar"><Icon name="assistant" /></div>
                )}
                <div className={`chat-bubble ${msg.role}`}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="chat-avatar user-avatar">你</div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="chat-bubble-wrap assistant">
                <div className="chat-avatar ai-avatar"><Icon name="assistant" /></div>
                <div className="chat-bubble assistant">
                  <div className="typing-indicator">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            {showQuickQuestions && (
              <div className="quick-questions-grid">
                {QUICK_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    className="quick-question-card"
                    onClick={() => handleSubmit(q.full)}
                    disabled={isLoading}
                  >
                    <Icon name={q.icon} className="qq-icon" />
                    <span>
                      <strong className="qq-text">{q.text}</strong>
                      <small>{q.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <form className="chat-input-area" onSubmit={handleFormSubmit}>
          <div className="chat-input-stack">
            <div className="chat-input-tools" aria-label="回答设置">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="visually-hidden"
                onChange={event => handleUploadPaper(event.target.files)}
              />
              <button
                type="button"
                className="chat-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPaper}
              >
                {isUploadingPaper ? <span className="spinner" /> : <Icon name="upload" />} 上传 PDF
              </button>
              <button type="button" className="chat-tool-btn" onClick={insertCurrentPaperReference}>
                <Icon name="paperclip" /> 引用当前论文
              </button>
              <label>
                <span>风格</span>
                <select value={answerStyle} onChange={e => setAnswerStyle(e.target.value as (typeof ANSWER_STYLES)[number])}>
                  {ANSWER_STYLES.map(style => <option key={style} value={style}>{style}</option>)}
                </select>
              </label>
              <label>
                <span>格式</span>
                <select value={outputFormat} onChange={e => setOutputFormat(e.target.value as (typeof OUTPUT_FORMATS)[number])}>
                  {OUTPUT_FORMATS.map(format => <option key={format} value={format}>{format}</option>)}
                </select>
              </label>
              <label className="chat-toggle">
                <input type="checkbox" checked={deepAnalysis} onChange={e => setDeepAnalysis(e.target.checked)} />
                深度分析
              </label>
              <label className="chat-toggle">
                <input
                  type="checkbox"
                  checked={paperOnly}
                  disabled={!selectedPaperId}
                  onChange={e => setPaperOnly(e.target.checked)}
                />
                仅基于当前论文
              </label>
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="提问、粘贴段落，或要求生成综述/审稿意见…"
              disabled={isLoading}
              rows={1}
              className="chat-textarea"
            />
          </div>
          <button
            type="submit"
            className="chat-send-btn"
            disabled={isLoading || !input.trim()}
            aria-label={isLoading ? '正在发送' : '发送消息'}
          >
            {isLoading ? <span className="spinner" /> : <Icon name="send" />}
          </button>
        </form>
      </main>
    </div>
  )
}
