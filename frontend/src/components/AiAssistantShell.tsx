import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
import { SYSTEM_DEFAULT_MODEL_VALUE, getAiModelLabel, useAiModelOptions } from '../lib/aiModels'
import type { Paper } from '../types'
import { Icon, type IconName } from './UiIcon'

interface LocalMessage {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME_MESSAGE: LocalMessage = {
  role: 'assistant',
  content: '已进入 AI 研究助手工作区。关联论文后可以直接提问，也可以使用下方快捷任务开始分析。',
}

const QUICK_QUESTIONS: Array<{ icon: IconName; text: string; detail: string; full: string }> = [
  {
    icon: 'chart',
    text: '总结我论文库中的研究方向',
    detail: '生成主题聚类、热点脉络和下一步阅读建议',
    full: '请帮我总结论文库中的主要研究方向，按主题聚类并指出每个方向的代表论文和潜在空白。',
  },
  {
    icon: 'microscope',
    text: '分析方法框架',
    detail: '拆解核心方法、实验设计和可复现细节',
    full: '请详细分析当前关联论文的方法框架，包括技术路线、关键模块、实验设计和创新点。',
  },
  {
    icon: 'fileText',
    text: '写文献综述段落',
    detail: '输出可直接改写进论文的综述草稿',
    full: '请基于我的论文库撰写一段文献综述，覆盖主要研究进展、代表性方法和发展趋势。',
  },
  {
    icon: 'warning',
    text: '指出不足之处',
    detail: '从实验、论证和泛化性角度批判性分析',
    full: '请分析当前关联论文的局限性、不足之处以及未来可以改进的方向。',
  },
]

const CHAT_MODES = ['论文解读', '方法分析', '实验总结', '创新点', '局限性', '中文通俗解释'] as const
const ANSWER_STYLES = ['学术', '简洁', '审稿式'] as const
const OUTPUT_FORMATS = ['卡片', '列表', '段落'] as const

const MODE_ACCENTS: Record<(typeof CHAT_MODES)[number], string> = {
  论文解读: 'blue',
  方法分析: 'indigo',
  实验总结: 'green',
  创新点: 'orange',
  局限性: 'red',
  中文通俗解释: 'slate',
}

function formatDate(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getPaperSource(paper: Paper | null) {
  if (!paper) return '论文库'
  return paper.source || paper.venue || '本地论文'
}

function getPaperTags(paper: Paper | null, chatMode: (typeof CHAT_MODES)[number]) {
  const tags = paper?.tags?.filter(Boolean) ?? []
  if (tags.length > 0) return tags.slice(0, 4)
  if (paper) return [getPaperSource(paper), chatMode, paper.year ? String(paper.year) : '待整理'].filter(Boolean).slice(0, 4)
  return ['论文解读', '研究规划', '智能问答']
}

function getPaperSummary(paper: Paper | null) {
  if (!paper?.abstract_raw) {
    return '选择一篇论文后，助手会围绕摘要、方法、实验和局限性组织分析内容。当前仍可基于论文库进行选题、综述和阅读规划。'
  }
  const compact = paper.abstract_raw.replace(/\s+/g, ' ').trim()
  return compact.length > 190 ? `${compact.slice(0, 190)}...` : compact
}

function getReadingStateLabel(status?: string) {
  if (status === 'read') return '已读'
  if (status === 'reading') return '阅读中'
  if (status === 'skipped') return '已跳过'
  return '未读'
}

export function AiAssistantShell({ papers }: { papers: Paper[] }) {
  const [sessions, setSessions] = useState<ChatSessionResponse[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<LocalMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState(SYSTEM_DEFAULT_MODEL_VALUE)
  const { modelOptions } = useAiModelOptions(selectedModel, setSelectedModel)
  const [localUploadedPapers, setLocalUploadedPapers] = useState<Paper[]>([])
  const [isUploadingPaper, setIsUploadingPaper] = useState(false)
  const [chatMode, setChatMode] = useState<(typeof CHAT_MODES)[number]>('论文解读')
  const [answerStyle, setAnswerStyle] = useState<(typeof ANSWER_STYLES)[number]>('学术')
  const [outputFormat, setOutputFormat] = useState<(typeof OUTPUT_FORMATS)[number]>('卡片')
  const [deepAnalysis, setDeepAnalysis] = useState(true)
  const [paperOnly, setPaperOnly] = useState(false)
  const [semanticQuery, setSemanticQuery] = useState('')
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([])
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const workspaceScrollRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageCache = useRef<Map<number, LocalMessage[]>>(new Map())

  const allPapers = [
    ...localUploadedPapers,
    ...papers.filter(paper => !localUploadedPapers.some(localPaper => localPaper.id === paper.id)),
  ]
  const selectedPaper = selectedPaperId ? allPapers.find(p => p.id === selectedPaperId) ?? null : null
  const displayPaper = selectedPaper ?? allPapers[0] ?? null
  const selectedPaperTitle = selectedPaper?.title ?? null
  const displayPaperTitle = displayPaper?.title ?? '选择或上传一篇论文开始分析'
  const selectedModelLabel = getAiModelLabel(selectedModel, modelOptions)
  const contextScope = selectedPaperId
    ? paperOnly ? '仅当前论文' : '当前论文 + 论文库'
    : '论文库 + 通用学术知识'
  const showQuickQuestions = messages.length <= 1
  const paperTags = getPaperTags(displayPaper, chatMode)
  const paperSummary = getPaperSummary(displayPaper)
  const relatedPapers = allPapers.filter(paper => paper.id !== displayPaper?.id).slice(0, 3)
  const activeSession = sessions.find(session => session.id === activeSessionId) ?? null

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
      setInput(prev => prev || 'PDF 上传失败，请稍后重试，或前往论文管理页面上传。')
    } finally {
      setIsUploadingPaper(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function loadSessions() {
    setIsLoadingSessions(true)
    try {
      const list = await fetchChatSessions()
      setSessions(list)
      if (list.length > 0 && !activeSessionId) {
        await switchToSession(list[0].id, list)
      }
    } catch {
      // Session loading failure should not block the assistant workspace.
    } finally {
      setIsLoadingSessions(false)
    }
  }

  async function switchToSession(id: number, sessionPool = sessions) {
    setActiveSessionId(id)
    if (messageCache.current.has(id)) {
      setMessages(messageCache.current.get(id)!)
      const cachedSession = sessionPool.find(session => session.id === id)
      if (cachedSession) {
        setSelectedPaperId(cachedSession.paper_id)
        setSelectedModel(cachedSession.model)
      }
      return
    }

    try {
      const detail = await fetchChatSessionDetail(id)
      setSelectedPaperId(detail.paper_id)
      setSelectedModel(detail.model)
      const nextMessages: LocalMessage[] = detail.messages.length > 0
        ? detail.messages
            .filter(message => message.role === 'user' || message.role === 'assistant')
            .map(message => ({ role: message.role as 'user' | 'assistant', content: message.content }))
        : [WELCOME_MESSAGE]
      setMessages(nextMessages)
      messageCache.current.set(id, nextMessages)
    } catch {
      setMessages([WELCOME_MESSAGE])
    }
  }

  async function handleNewChat() {
    try {
      const newSession = await createChatSession({
        title: '新对话',
        paper_id: selectedPaperId,
        model: selectedModel || undefined,
      })
      setSessions(prev => [newSession, ...prev])
      setActiveSessionId(newSession.id)
      setMessages([WELCOME_MESSAGE])
      messageCache.current.set(newSession.id, [WELCOME_MESSAGE])
      setInput('')
      return newSession.id
    } catch {
      return null
    }
  }

  async function handleDeleteSession(id: number) {
    try {
      await deleteChatSession(id)
      const remaining = sessions.filter(session => session.id !== id)
      setSessions(remaining)
      messageCache.current.delete(id)
      if (activeSessionId === id) {
        if (remaining.length > 0) {
          await switchToSession(remaining[0].id, remaining)
        } else {
          setActiveSessionId(null)
          setMessages([WELCOME_MESSAGE])
        }
      }
    } catch {
      // Ignore delete failures in the shell; the next reload will reconcile state.
    }
  }

  async function handleSubmit(messageText?: string) {
    const text = (messageText || input).trim()
    if (!text || isLoading) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await handleNewChat()
      if (!sessionId) return
    }

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
      const { reply } = await sendSessionMessage(sessionId, requestText, selectedPaperId, selectedModel)
      const finalMessages = [...updatedMessages, { role: 'assistant' as const, content: reply }]
      setMessages(finalMessages)
      messageCache.current.set(sessionId, finalMessages)

      setSessions(prev => prev.map(session => {
        if (session.id !== sessionId) return session
        const isFirst = updatedMessages.filter(message => message.role === 'user').length === 1
        return {
          ...session,
          title: isFirst ? text.slice(0, 25) + (text.length > 25 ? '...' : '') : session.title,
          paper_id: selectedPaperId,
          model: selectedModel,
        }
      }))
    } catch (error) {
      const errMsg: LocalMessage = {
        role: 'assistant',
        content: error instanceof Error ? `错误：${error.message}` : '抱歉，系统出现错误，请稍后重试。',
      }
      const finalMessages = [...updatedMessages, errMsg]
      setMessages(finalMessages)
      messageCache.current.set(sessionId, finalMessages)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (!workspaceScrollRef.current || showQuickQuestions) return
    workspaceScrollRef.current.scrollTop = workspaceScrollRef.current.scrollHeight
  }, [messages, isLoading, showQuickQuestions])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 132) + 'px'
    }
  }, [input])

  useEffect(() => {
    if (!selectedPaperId && paperOnly) {
      setPaperOnly(false)
    }
  }, [paperOnly, selectedPaperId])

  useEffect(() => {
    if (!isLoadingSessions && sessions.length === 0 && !activeSessionId) {
      handleNewChat()
    }
  }, [isLoadingSessions, sessions.length, activeSessionId])

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    handleSubmit()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const getSessionPaperTitle = (paperId: number | null) => {
    if (!paperId) return '未关联论文'
    return allPapers.find(paper => paper.id === paperId)?.title ?? '关联论文 1 篇'
  }

  const getSessionSummary = (session: ChatSessionResponse) => {
    if (session.title === '新对话') return '准备开始新的论文问答'
    return `讨论${session.paper_id ? '当前论文' : '论文库'}的研究问题`
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
      : displayPaper
        ? `请先关联论文《${displayPaper.title}》，然后回答：`
        : '请先选择一篇关联论文，然后基于该论文回答：'
    if (displayPaper && !selectedPaperId) {
      setSelectedPaperId(displayPaper.id)
    }
    setInput(prev => prev ? `${prev}\n${reference}` : reference)
    inputRef.current?.focus()
  }

  const primePrompt = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const renderedMessages = showQuickQuestions
    ? messages
    : messages.filter((message, index) => !(index === 0 && message.content === WELCOME_MESSAGE.content))

  return (
    <div className="workspace-content-grid ai-assistant-shell assistant-research-workbench">
      <aside className="assistant-conversation-sidebar" aria-label="对话历史">
        <header className="assistant-history-header">
          <div>
            <h2>对话历史</h2>
            <p>按论文和任务回溯研究记录</p>
          </div>
          <button type="button" onClick={handleNewChat}>
            <Icon name="spark" />
            新建对话
          </button>
        </header>

        <ul className="assistant-session-list">
          {filteredSessions.map(session => (
            <li key={session.id}>
              <button
                type="button"
                className={`assistant-session-card ${session.id === activeSessionId ? 'active' : ''}`}
                onClick={() => switchToSession(session.id)}
              >
                <span className="assistant-session-status">{session.id === activeSessionId ? '当前对话' : '最近对话'}</span>
                <strong>{session.title}</strong>
                <span className="assistant-history-summary">{getSessionSummary(session)}</span>
                <span className="assistant-history-paper">{getSessionPaperTitle(session.paper_id)}</span>
                <span className="assistant-history-meta">
                  <span>{formatDate(session.updated_at || session.created_at)}</span>
                  <span>{getAiModelLabel(session.model, modelOptions)}</span>
                </span>
              </button>
              <button
                type="button"
                className="chat-session-delete"
                onClick={event => {
                  event.stopPropagation()
                  handleDeleteSession(session.id)
                }}
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

      <main ref={workspaceScrollRef} className="assistant-analysis-workspace" aria-label="论文分析工作区">
        <section className="assistant-paper-hero">
          <div className="assistant-paper-copy">
            <span className="assistant-paper-source">来源：{getPaperSource(displayPaper)} | {displayPaper?.year ?? '年份待补充'}</span>
            <h2>{displayPaperTitle}</h2>
            <p>{paperSummary}</p>
            <div className="assistant-paper-tags">
              {paperTags.map(tag => <span key={tag}>{tag}</span>)}
            </div>
          </div>
          <div className="assistant-paper-actions">
            {displayPaper ? (
              <Link className="assistant-ghost-button" to={`/paper/${displayPaper.id}`}>
                <Icon name="fileText" />
                打开论文
              </Link>
            ) : (
              <button type="button" className="assistant-ghost-button" disabled>
                <Icon name="fileText" />
                打开论文
              </button>
            )}
            <button type="button" className="assistant-ghost-button" onClick={() => primePrompt('请生成当前论文的结构化摘要，包含问题、方法、实验和结论。')}>
              <Icon name="spark" />
              生成摘要
            </button>
            <button type="button" className="assistant-ghost-button" onClick={() => primePrompt('请提取当前论文的核心贡献、方法亮点和可复现要点。')}>
              <Icon name="target" />
              提取贡献
            </button>
          </div>
        </section>

        <nav className="assistant-mode-tabs" aria-label="分析模式">
          {CHAT_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              className={mode === chatMode ? 'active' : ''}
              data-accent={MODE_ACCENTS[mode]}
              onClick={() => setChatMode(mode)}
            >
              {mode}
            </button>
          ))}
        </nav>

        <section className="assistant-answer-panel">
          <div className="assistant-answer-head">
            <div className="chat-avatar ai-avatar"><Icon name="assistant" /></div>
            <div>
              <strong>AI 助手</strong>
              <span>{formatDate(activeSession?.updated_at)} | {chatMode} | {contextScope}</span>
            </div>
          </div>

          {showQuickQuestions ? (
            <div className="assistant-default-analysis">
              <p>{WELCOME_MESSAGE.content}</p>
              <h3>核心要点</h3>
              <div className="assistant-insight-grid">
                <article data-tone="blue">
                  <strong>问题与目标</strong>
                  <span>快速定位论文要解决的研究问题、任务边界和评价标准。</span>
                </article>
                <article data-tone="green">
                  <strong>方法框架</strong>
                  <span>按模块拆解方法流程，并标出可复现所需的输入、输出和假设。</span>
                </article>
                <article data-tone="orange">
                  <strong>实验结果</strong>
                  <span>汇总基线、指标和消融设计，判断结论是否被实验充分支撑。</span>
                </article>
                <article data-tone="slate">
                  <strong>后续问题</strong>
                  <span>生成适合继续追问的研究问题，帮助延展成综述或实验计划。</span>
                </article>
              </div>
              <div className="quick-questions-grid">
                {QUICK_QUESTIONS.map(question => (
                  <button
                    key={question.text}
                    type="button"
                    className="quick-question-card"
                    onClick={() => handleSubmit(question.full)}
                    disabled={isLoading}
                  >
                    <Icon name={question.icon} className="qq-icon" />
                    <span>
                      <strong className="qq-text">{question.text}</strong>
                      <small>{question.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-message-thread">
              {renderedMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`chat-bubble-wrap ${message.role}`}>
                  {message.role === 'assistant' && (
                    <div className="chat-avatar ai-avatar"><Icon name="assistant" /></div>
                  )}
                  <div className={`chat-bubble ${message.role}`}>
                    {message.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <span>{message.content}</span>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="chat-avatar user-avatar">你</div>
                  )}
                </div>
              ))}
            </div>
          )}

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
          <div ref={messagesEndRef} />
        </section>

        <section className="assistant-followups" aria-label="建议继续追问">
          <strong>建议继续追问</strong>
          {['课程学习是如何设计的？', '主要贡献和局限分别是什么？', '与 Human 解题过程有哪些差异？', '实验设置是否足够可靠？'].map(prompt => (
            <button key={prompt} type="button" onClick={() => primePrompt(prompt)}>{prompt}</button>
          ))}
        </section>

        <form className="chat-input-area assistant-composer" onSubmit={handleFormSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            onChange={event => handleUploadPaper(event.target.files)}
          />
          <div className="chat-input-stack">
            <textarea
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="向 AI 助手提问，与论文进行深度对话..."
              disabled={isLoading}
              rows={1}
              className="chat-textarea"
            />
            <div className="chat-input-tools" aria-label="回答设置">
              <button
                type="button"
                className="chat-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPaper}
              >
                {isUploadingPaper ? <span className="spinner" /> : <Icon name="upload" />}
                上传 PDF
              </button>
              <button type="button" className="chat-tool-btn" onClick={insertCurrentPaperReference}>
                <Icon name="paperclip" />
                引用当前论文
              </button>
              <label>
                <Icon name="search" />
                <input
                  value={semanticQuery}
                  onChange={event => setSemanticQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSemanticSearch()
                    }
                  }}
                  placeholder="联网搜索"
                />
              </label>
              <label>
                <span>模型</span>
                <select value={selectedModel} onChange={event => setSelectedModel(event.target.value)}>
                  {modelOptions.map(model => <option key={model.value || 'system-default'} value={model.value}>{model.label}</option>)}
                  {selectedModel && !modelOptions.some(model => model.value === selectedModel) ? (
                    <option value={selectedModel}>{selectedModelLabel}</option>
                  ) : null}
                </select>
              </label>
              <label>
                <span>风格</span>
                <select value={answerStyle} onChange={event => setAnswerStyle(event.target.value as (typeof ANSWER_STYLES)[number])}>
                  {ANSWER_STYLES.map(style => <option key={style} value={style}>{style}</option>)}
                </select>
              </label>
              <label>
                <span>格式</span>
                <select value={outputFormat} onChange={event => setOutputFormat(event.target.value as (typeof OUTPUT_FORMATS)[number])}>
                  {OUTPUT_FORMATS.map(format => <option key={format} value={format}>{format}</option>)}
                </select>
              </label>
              <label className="chat-toggle">
                <input type="checkbox" checked={deepAnalysis} onChange={event => setDeepAnalysis(event.target.checked)} />
                深度分析
              </label>
              <label className="chat-toggle">
                <input
                  type="checkbox"
                  checked={paperOnly}
                  disabled={!selectedPaperId}
                  onChange={event => setPaperOnly(event.target.checked)}
                />
                仅基于当前论文
              </label>
            </div>
            {semanticResults.length > 0 && (
              <div className="semantic-results assistant-semantic-results">
                {semanticResults.map(result => (
                  <button
                    type="button"
                    key={result.paper.id}
                    className="semantic-result-item"
                    onClick={() => setSelectedPaperId(result.paper.id)}
                  >
                    <span className="semantic-result-copy">
                      <strong>{result.paper.title}</strong>
                      {(result.paper.tags ?? []).length > 0 && (
                        <span className="semantic-result-tags">
                          {result.paper.tags!.map(tag => <em key={tag}>{tag}</em>)}
                        </span>
                      )}
                    </span>
                    <span className="semantic-result-score">{(result.similarity * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            )}
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

      <aside className="assistant-insight-rail" aria-label="论文信息和洞察">
        <section className="assistant-side-card paper-info-card">
          <h2>论文信息</h2>
          <div className="assistant-paper-info-row">
            <div className="assistant-paper-thumb" aria-hidden="true">
              <span />
              <span />
              <span />
              <b />
            </div>
            <div>
              <strong>{displayPaperTitle}</strong>
              <span>{getPaperSource(displayPaper)} · {displayPaper?.year ?? '年份待补充'}</span>
            </div>
          </div>
          <dl className="assistant-paper-stats">
            <div><dt>阅读状态</dt><dd>{getReadingStateLabel(displayPaper?.reading_status)}</dd></div>
            <div><dt>阅读进度</dt><dd>{displayPaper?.reading_progress ?? 0}%</dd></div>
            <div><dt>摘要状态</dt><dd>{displayPaper?.summary_status === 'completed' ? '已生成' : '待生成'}</dd></div>
            <div><dt>向量索引</dt><dd>{displayPaper?.embedding_status === 'completed' ? '可检索' : '待处理'}</dd></div>
          </dl>
          {displayPaper && (
            <Link to={`/paper/${displayPaper.id}`} className="assistant-side-link">查看详情</Link>
          )}
        </section>

        <section className="assistant-side-card">
          <h2>论文洞见</h2>
          <div className="assistant-insight-list">
            <article>
              <span data-tone="blue"><Icon name="target" /></span>
              <div>
                <strong>研究问题</strong>
                <p>{displayPaper ? '围绕论文摘要、方法链路和实验结论建立问答上下文。' : '从论文库中选择研究对象后生成针对性洞见。'}</p>
              </div>
            </article>
            <article>
              <span data-tone="orange"><Icon name="spark" /></span>
              <div>
                <strong>主要贡献</strong>
                <p>提炼方法创新、数据或任务设定、实验提升和可复用结论。</p>
              </div>
            </article>
            <article>
              <span data-tone="green"><Icon name="link" /></span>
              <div>
                <strong>方法亮点</strong>
                <p>结合当前模式输出结构化分析，便于继续写综述或实验计划。</p>
              </div>
            </article>
          </div>
        </section>

        <section className="assistant-side-card">
          <h2>相关资源</h2>
          <div className="assistant-resource-list">
            {relatedPapers.length > 0 ? relatedPapers.map(paper => (
              <button key={paper.id} type="button" onClick={() => setSelectedPaperId(paper.id)}>
                <Icon name="fileText" />
                <span>{paper.title}</span>
                <em>{paper.year ?? '待整理'}</em>
              </button>
            )) : (
              <>
                <button type="button" onClick={() => primePrompt('请列出这篇论文最适合延伸阅读的相关主题。')}>
                  <Icon name="fileText" />
                  <span>延伸阅读主题</span>
                  <em>建议</em>
                </button>
                <button type="button" onClick={() => primePrompt('请把当前论文整理成一页组会汇报提纲。')}>
                  <Icon name="fileText" />
                  <span>组会汇报提纲</span>
                  <em>模板</em>
                </button>
              </>
            )}
          </div>
        </section>
      </aside>
    </div>
  )
}
