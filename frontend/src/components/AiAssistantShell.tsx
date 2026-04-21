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
  type ChatSessionResponse,
  type ChatMessageResponse,
  type SemanticSearchResult,
} from '../lib/api'
import type { Paper } from '../types'
import { Icon, type IconName } from './UiIcon'

interface LocalMessage {
  role: 'user' | 'assistant'
  content: string
}

const MODELS = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
]

const WELCOME_MESSAGE: LocalMessage = {
  role: 'assistant',
  content: '你好！我是你的学术研究助手。\n\n我可以帮你：\n- **总结论文内容**：选择一篇论文，我来帮你快速理解\n- **分析研究趋势**：基于你的论文库给出洞察\n- **回答学术问题**：关于方法论、实验设计等\n\n请在下方选择关联论文和模型，然后开始提问吧！'
}

const QUICK_QUESTIONS: Array<{ icon: IconName; text: string; full: string }> = [
  { icon: 'chart', text: '总结我论文库中的研究方向', full: '请帮我总结一下我论文库中所有论文的研究方向和主题分布。' },
  { icon: 'microscope', text: '分析这篇论文的方法论', full: '请帮我详细分析当前关联论文的研究方法论，包括技术路线、实验设计和创新点。' },
  { icon: 'fileText', text: '帮我写文献综述段落', full: '请基于我论文库中的论文，帮我撰写一段文献综述，涵盖主要研究进展和发展趋势。' },
  { icon: 'warning', text: '指出论文的不足之处', full: '请帮我分析当前关联论文的局限性、不足之处以及未来可以改进的方向。' },
]

export function AiAssistantShell({ papers }: { papers: Paper[] }) {
  const [sessions, setSessions] = useState<ChatSessionResponse[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<LocalMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value)
  const [semanticQuery, setSemanticQuery] = useState('')
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([])
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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

    setIsLoading(true)
    try {
      const { reply } = await sendSessionMessage(activeSessionId, text, selectedPaperId, selectedModel)
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
  }, [input, isLoading, activeSessionId, messages, selectedPaperId, selectedModel])

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

  const selectedPaperTitle = selectedPaperId
    ? papers.find(p => p.id === selectedPaperId)?.title
    : null

  const showQuickQuestions = messages.length <= 1

  return (
    <div className="workspace-content-grid ai-assistant-shell">
      {/* 侧边栏：检索与历史记录 */}
      <aside className="reading-list-panel">
        
        {/* Semantic Search */}
        <div className="semantic-search-section">
          <div className="semantic-search-bar">
            <input
              className="paper-search-input"
              style={{ marginBottom: 0, flex: 1 }}
              placeholder="语义搜索论文库..."
              value={semanticQuery}
              onChange={e => setSemanticQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSemanticSearch()}
            />
            <button
              className="btn-primary"
              style={{ width: 44, height: 38, borderRadius: 8, flexShrink: 0 }}
              onClick={handleSemanticSearch}
              disabled={isSearchingSemantic || !semanticQuery.trim()}
              aria-label="语义搜索"
            ><Icon name="search" /></button>
          </div>
          {semanticResults.length > 0 && (
            <div className="semantic-results" style={{ marginBottom: '24px' }}>
              {semanticResults.map(r => (
                <div
                  key={r.paper.id}
                  className="semantic-result-item"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-layer-1)', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' }}
                  onClick={() => setSelectedPaperId(r.paper.id)}
                >
                  <div style={{ flex: 1, marginRight: '12px', overflow: 'hidden' }}>
                    <div className="semantic-result-title" style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.paper.title}</div>
                    {(r.paper.tags ?? []).length > 0 && (
                      <div className="semantic-result-tags" style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {r.paper.tags!.map(t => <span key={t} style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--bg-hover)', borderRadius: '4px' }}>{t}</span>)}
                      </div>
                    )}
                  </div>
                  <span className="semantic-result-score" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>{(r.similarity * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <header className="assistant-history-header">
          <h2>对话历史</h2>
          <button type="button" onClick={handleNewChat}>+ 新建</button>
        </header>
        <ul>
          {sessions.map(session => (
            <li
              key={session.id}
              className={session.id === activeSessionId ? 'active' : ''}
              onClick={() => switchToSession(session.id)}
            >
                <div className="assistant-history-title">{session.title}</div>
                <div className="assistant-history-meta">
                  <span className="assistant-history-date">{new Date(session.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                  <span className="assistant-history-badge">{session.model}</span>
                </div>
              <button
                type="button"
                className="chat-session-delete"
                onClick={e => { e.stopPropagation(); handleDeleteSession(session.id) }}
                title="删除会话"
              >✕</button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 主对话区 */}
      <main className="assistant-chat-main">
        <header className="assistant-chat-header">
          <div className="chat-header-top">
            <div>
              <h2>学术研究助手</h2>
              <p>智能论文问答 · 研究洞察 · 趋势分析</p>
            </div>
          </div>
          <div className="chat-header-controls">
            <div className="chat-control-group">
              <label className="chat-control-label">关联论文</label>
              <select
                className="chat-select"
                value={selectedPaperId ?? ''}
                onChange={e => setSelectedPaperId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">不关联 · 通用问答</option>
                {papers.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div className="chat-control-group">
              <label className="chat-control-label">AI 模型</label>
              <select
                className="chat-select"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
              >
                {MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          {selectedPaperTitle && (
            <div className="chat-context-badge">
              <Icon name="paperclip" />
              当前关联：《{selectedPaperTitle.length > 30 ? selectedPaperTitle.slice(0, 30) + '…' : selectedPaperTitle}》
            </div>
          )}
        </header>

        <div className="chat-messages-scroll-area">
          <div className="chat-messages-container">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble-wrap ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-avatar ai-avatar">✦</div>
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
                <div className="chat-avatar ai-avatar">✦</div>
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
                    <span className="qq-text">{q.text}</span>
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <form className="chat-input-area" onSubmit={handleFormSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，Shift+Enter 换行…"
            disabled={isLoading}
            rows={1}
            className="chat-textarea"
          />
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
