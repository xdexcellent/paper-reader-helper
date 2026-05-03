import { useState, useEffect } from 'react'
import { importPaperFromUrl, UNAUTHORIZED_EVENT } from '../lib/api'
import { Icon } from './UiIcon'
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function notifyUnauthorized(response: Response) {
  if (response.status !== 401) return

  let message = '登录已过期，请重新登录'
  try {
    const payload = await response.clone().json()
    message = payload.detail ?? message
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, {
    detail: { message },
  }))
}

interface SubscriptionItem {
  id: number
  name: string
  type: string
  source_kind: string
  display_name: string
  query: string
  config: Record<string, unknown>
  fetch_limit: number
  is_active: boolean
  last_checked_at: string | null
  last_success_at: string | null
  last_error: string | null
  created_at: string
}

const SOURCE_KIND_OPTIONS = [
  { value: 'arxiv', label: 'arXiv', description: '关键词搜索 arXiv 论文' },
  { value: 'rss', label: 'RSS', description: '通过 RSS/Atom 订阅源获取论文' },
  { value: 'openreview', label: 'OpenReview', description: '按会议/邀请获取 OpenReview 论文' },
  { value: 'hf_papers', label: 'HF Papers', description: '抓取 Hugging Face Daily Papers' },
  { value: 'github_trending', label: 'GitHub Trending', description: '追踪 GitHub 趋势项目' },
] as const

const SOURCE_KIND_COLORS: Record<string, string> = {
  arxiv: '#b31b1b',
  rss: '#f26522',
  openreview: '#8c1515',
  hf_papers: '#ff9d00',
  github_trending: '#238636',
}

interface SubscriptionPreset {
  name: string
  source_kind: string
  query?: string
  config?: Record<string, string>
  fetch_limit?: number
  description: string
}

// Curated presets for sources that reliably provide downloadable PDFs.
// Click to one-tap populate the create form.
const SUBSCRIPTION_PRESETS: SubscriptionPreset[] = [
  {
    name: 'arXiv 机器学习 (cs.LG)',
    source_kind: 'arxiv',
    query: 'cat:cs.LG',
    fetch_limit: 10,
    description: 'arXiv 直供 PDF，最稳定',
  },
  {
    name: 'arXiv 人工智能 (cs.AI)',
    source_kind: 'arxiv',
    query: 'cat:cs.AI',
    fetch_limit: 10,
    description: 'arXiv 直供 PDF',
  },
  {
    name: 'arXiv 计算机视觉 (cs.CV)',
    source_kind: 'arxiv',
    query: 'cat:cs.CV',
    fetch_limit: 10,
    description: 'arXiv 直供 PDF',
  },
  {
    name: 'arXiv 自然语言处理 (cs.CL)',
    source_kind: 'arxiv',
    query: 'cat:cs.CL',
    fetch_limit: 10,
    description: 'arXiv 直供 PDF',
  },
  {
    name: 'arXiv RSS - cs.AI',
    source_kind: 'rss',
    query: 'https://rss.arxiv.org/rss/cs.AI',
    fetch_limit: 15,
    description: 'arXiv RSS Feed，直链 PDF',
  },
  {
    name: 'arXiv RSS - cs.LG',
    source_kind: 'rss',
    query: 'https://rss.arxiv.org/rss/cs.LG',
    fetch_limit: 15,
    description: 'arXiv RSS Feed，直链 PDF',
  },
  {
    name: 'OpenReview - ICLR 2025',
    source_kind: 'openreview',
    config: { venue: 'ICLR.cc/2025/Conference' },
    fetch_limit: 10,
    description: '会议直链 PDF',
  },
  {
    name: 'OpenReview - NeurIPS 2024',
    source_kind: 'openreview',
    config: { venue: 'NeurIPS.cc/2024/Conference' },
    fetch_limit: 10,
    description: '会议直链 PDF',
  },
  {
    name: 'HuggingFace Daily Papers',
    source_kind: 'hf_papers',
    fetch_limit: 10,
    description: 'HF 精选，已自动回退到 arXiv PDF',
  },
]

interface ArxivPaper {
  title: string
  authors: string
  abstract: string
  pdf_url: string
  arxiv_id: string
  published: string
}

function getStringConfigValue(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' ? value : undefined
}

export function SubscriptionPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])
  const [loading, setLoading] = useState(true)

  // Search/preview state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ArxivPaper[]>([])
  const [searching, setSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem('arxiv_search_history') || '[]')
      setSearchHistory(history)
    } catch {
      setSearchHistory([])
    }
  }, [])

  // Create form  
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSourceKind, setNewSourceKind] = useState<string>('arxiv')
  const [newQuery, setNewQuery] = useState('')
  const [newConfig, setNewConfig] = useState<Record<string, string>>({})
  const [newFetchLimit, setNewFetchLimit] = useState(10)

  // Edit form
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSourceKind, setEditSourceKind] = useState<string>('arxiv')
  const [editQuery, setEditQuery] = useState('')
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})
  const [editFetchLimit, setEditFetchLimit] = useState(10)
  const [savingEdit, setSavingEdit] = useState(false)

  // Fetch results
  const [fetchResults, setFetchResults] = useState<ArxivPaper[]>([])
  const [fetchingId, setFetchingId] = useState<number | null>(null)

  useEffect(() => {
    loadSubscriptions()
  }, [])

  async function loadSubscriptions() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subscriptions`, { headers: getAuthHeaders() })
      if (res.ok) {
        setSubscriptions(await res.json())
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleSearch(queryToSearch?: string) {
    const q = (typeof queryToSearch === 'string' ? queryToSearch : searchQuery).trim()
    if (!q) return
    setSearching(true)
    setSearchResults([])
    
    // Save history
    const newHistory = [q, ...searchHistory.filter(h => h !== q)].slice(0, 5)
    setSearchHistory(newHistory)
    localStorage.setItem('arxiv_search_history', JSON.stringify(newHistory))
    setSearchQuery(q)
    
    try {
      const res = await fetch(`${API_BASE}/subscriptions/preview?type=arxiv&query=${encodeURIComponent(q)}&max_results=5`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        setSearchResults(await res.json())
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
    finally { setSearching(false) }
  }

  function resetCreateForm() {
    setNewName('')
    setNewSourceKind('arxiv')
    setNewQuery('')
    setNewConfig({})
    setNewFetchLimit(10)
  }

  function isCreateValid(): boolean {
    if (!newName.trim()) return false
    if (newSourceKind === 'arxiv' || newSourceKind === 'rss') {
      return !!newQuery.trim()
    }
    if (newSourceKind === 'openreview') {
      return !!(newConfig.venue || newConfig.invitation)
    }
    return true
  }

  async function handleCreate() {
    if (!isCreateValid()) return
    const config: Record<string, unknown> = { ...newConfig }
    if (newSourceKind === 'rss' && newQuery.trim()) {
      config.feed_url = newQuery.trim()
    }
    try {
      const res = await fetch(`${API_BASE}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: newName,
          source_kind: newSourceKind,
          query: newQuery,
          config,
          fetch_limit: newFetchLimit,
        }),
      })
      if (res.ok) {
        setShowCreate(false)
        resetCreateForm()
        await loadSubscriptions()
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
  }

  function handleStartEdit(sub: SubscriptionItem) {
    setEditingId(sub.id)
    setEditName(sub.name)
    const kind = sub.source_kind || sub.type || 'arxiv'
    setEditSourceKind(kind)
    const cfg = (sub.config || {}) as Record<string, unknown>
    if (kind === 'rss') {
      const feedUrl = typeof cfg.feed_url === 'string' ? cfg.feed_url : ''
      setEditQuery(feedUrl || sub.query || '')
      setEditConfig({})
    } else {
      setEditQuery(sub.query || '')
      const cleanCfg: Record<string, string> = {}
      Object.keys(cfg).forEach(k => {
        const v = cfg[k]
        if (typeof v === 'string') cleanCfg[k] = v
      })
      setEditConfig(cleanCfg)
    }
    setEditFetchLimit(sub.fetch_limit || 10)
    setShowCreate(false)
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditSourceKind('arxiv')
    setEditQuery('')
    setEditConfig({})
    setEditFetchLimit(10)
  }

  function isEditValid(): boolean {
    if (!editName.trim()) return false
    if (editSourceKind === 'arxiv' || editSourceKind === 'rss') {
      return !!editQuery.trim()
    }
    if (editSourceKind === 'openreview') {
      return !!(editConfig.venue || editConfig.invitation)
    }
    return true
  }

  async function handleSaveEdit() {
    if (editingId === null || !isEditValid()) return
    setSavingEdit(true)
    const config: Record<string, unknown> = { ...editConfig }
    if (editSourceKind === 'rss' && editQuery.trim()) {
      config.feed_url = editQuery.trim()
    }
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: editName,
          source_kind: editSourceKind,
          query: editQuery,
          config,
          fetch_limit: editFetchLimit,
        }),
      })
      if (res.ok) {
        handleCancelEdit()
        await loadSubscriptions()
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
    finally { setSavingEdit(false) }
  }

  async function handleToggleActive(sub: SubscriptionItem) {
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_active: !sub.is_active }),
      })
      if (res.ok) {
        await loadSubscriptions()
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        await loadSubscriptions()
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
  }

  async function handleFetch(id: number) {
    setFetchingId(id)
    setFetchResults([])
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/fetch`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        setFetchResults(await res.json())
        await loadSubscriptions()
      } else {
        await notifyUnauthorized(res)
      }
    } catch { /* ignore */ }
    finally { setFetchingId(null) }
  }

  return (
    <div className="subscription-page">
      {/* Quick Search */}
      <section className="glass-card subscription-card">
        <h3 className="subscription-section-title"><Icon name="search" />arXiv 快速搜索</h3>
        <div className="subscription-search-row">
          <input
            className="paper-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="输入关键词搜索 arXiv 论文... (如: diffusion model, transformer)"
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSearch()}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {searchHistory.length > 0 && searchResults.length === 0 && !searching && (
          <div className="search-history-row">
            <span>历史搜索:</span>
            {searchHistory.map((h, i) => (
              <button
                key={i}
                type="button"
                className="status-badge"
                onClick={() => handleSearch(h)}
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="subscription-result-list">
            {searchResults.map((paper, i) => (
              <ArxivPaperCard key={i} paper={paper} />
            ))}
          </div>
        )}
      </section>

      {/* Subscription Management */}
      <section className="glass-card subscription-card">
        <div className="subscription-card-header">
          <h3 className="subscription-section-title"><Icon name="rss" />我的订阅</h3>
          <button className="new-subscribe-btn compact" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? '取消' : '+ 新建订阅'}
          </button>
        </div>

        {showCreate && (
          <div className="subscription-create-card">
            <div className="form-group">
              <label>推荐订阅源（点击一键填充）</label>
              <div className="subscription-preset-list" role="list">
                {SUBSCRIPTION_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    className="subscription-preset-chip"
                    title={preset.description}
                    onClick={() => {
                      setNewName(preset.name)
                      setNewSourceKind(preset.source_kind)
                      setNewQuery(preset.query || '')
                      setNewConfig(preset.config ? { ...preset.config } : {})
                      setNewFetchLimit(preset.fetch_limit ?? 10)
                    }}
                  >
                    <span
                      className="subscription-preset-dot"
                      style={{ background: SOURCE_KIND_COLORS[preset.source_kind] || '#888' }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                这些订阅源都能稳定下载 PDF。其他来源（如 GitHub Trending）以项目类型保留。
              </div>
            </div>
            <div className="form-group">
              <label>订阅名称</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如: Diffusion Models 最新论文" />
            </div>
            <div className="form-group">
              <label>订阅源类型</label>
              <select
                value={newSourceKind}
                onChange={e => { setNewSourceKind(e.target.value); setNewQuery(''); setNewConfig({}) }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-layer-1)', color: 'var(--text-primary)', fontSize: 14 }}
              >
                {SOURCE_KIND_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                ))}
              </select>
            </div>

            {(newSourceKind === 'arxiv') && (
              <div className="form-group">
                <label>arXiv 搜索关键词</label>
                <input value={newQuery} onChange={e => setNewQuery(e.target.value)} placeholder="如: diffusion model image generation 或 cat:cs.LG" />
              </div>
            )}

            {(newSourceKind === 'rss') && (
              <div className="form-group">
                <label>RSS / Atom Feed URL</label>
                <input value={newQuery} onChange={e => setNewQuery(e.target.value)} placeholder="如: https://arxiv.org/rss/cs.AI" />
              </div>
            )}

            {(newSourceKind === 'openreview') && (
              <>
                <div className="form-group">
                  <label>会议 Venue ID（二选一）</label>
                  <input value={newConfig.venue || ''} onChange={e => setNewConfig(c => ({ ...c, venue: e.target.value }))} placeholder="如: ICLR.cc/2025/Conference" />
                </div>
                <div className="form-group">
                  <label>Invitation（二选一）</label>
                  <input value={newConfig.invitation || ''} onChange={e => setNewConfig(c => ({ ...c, invitation: e.target.value }))} placeholder="如: ICLR.cc/2025/Conference/-/Blind_Submission" />
                </div>
                <div className="form-group">
                  <label>关键词过滤（可选）</label>
                  <input value={newQuery} onChange={e => setNewQuery(e.target.value)} placeholder="如: diffusion（空格分隔多个关键词，需全部命中）" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    留空则订阅会议全部论文；填写后只保留标题 / 摘要 / 关键词包含全部关键词的论文。
                  </div>
                </div>
              </>
            )}

            {(newSourceKind === 'hf_papers') && (
              <div className="form-group">
                <label>页面 URL（可选，留空使用默认 Daily Papers）</label>
                <input value={newConfig.url || ''} onChange={e => setNewConfig(c => ({ ...c, url: e.target.value }))} placeholder="https://huggingface.co/papers" />
              </div>
            )}

            {(newSourceKind === 'github_trending') && (
              <>
                <div className="form-group">
                  <label>编程语言（可选）</label>
                  <input value={newConfig.language || ''} onChange={e => setNewConfig(c => ({ ...c, language: e.target.value }))} placeholder="如: python（留空则不限语言）" />
                </div>
                <div className="form-group">
                  <label>时间范围</label>
                  <select
                    value={newConfig.since || 'daily'}
                    onChange={e => setNewConfig(c => ({ ...c, since: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-layer-1)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    <option value="daily">今日</option>
                    <option value="weekly">本周</option>
                    <option value="monthly">本月</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label>每次拉取上限</label>
              <input type="number" min={1} max={20} value={newFetchLimit} onChange={e => setNewFetchLimit(Math.max(1, Math.min(20, Number(e.target.value) || 10)))} />
            </div>

            <button className="btn btn-primary" onClick={handleCreate} disabled={!isCreateValid()}>
              创建订阅
            </button>
          </div>
        )}

        {loading ? (
          <div className="paper-detail-loading" style={{ minHeight: 120 }}>
            <div className="loading-spinner" /><span>加载中...</span>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="briefing-empty">还没有订阅，点击上方 "新建订阅" 开始。</div>
        ) : (
          <div className="subscription-list">
            {subscriptions.map(sub => {
              const kind = sub.source_kind || sub.type || 'arxiv'
              const kindLabel = SOURCE_KIND_OPTIONS.find(o => o.value === kind)?.label ?? kind
              const kindColor = SOURCE_KIND_COLORS[kind] || 'var(--text-muted)'
              const queryLabel = kind === 'rss' ? 'Feed URL' : kind === 'arxiv' ? '关键词' : '配置'
              let queryDisplay: string
              if (kind === 'openreview') {
                const venueOrInv = getStringConfigValue(sub.config, 'venue') || getStringConfigValue(sub.config, 'invitation') || '—'
                queryDisplay = sub.query ? `${venueOrInv} · 过滤: ${sub.query}` : venueOrInv
              } else if (kind === 'hf_papers') {
                queryDisplay = sub.query || 'HF Daily Papers'
              } else if (kind === 'github_trending') {
                const language = getStringConfigValue(sub.config, 'language') || '全部语言'
                const since = getStringConfigValue(sub.config, 'since') || 'daily'
                queryDisplay = sub.query || `${language} / ${since}`
              } else {
                queryDisplay = sub.query || '—'
              }
              const isEditing = editingId === sub.id
              return (
              <article key={sub.id} className="subscription-item">
                <div className="subscription-item-main">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div className="paper-item-title">{sub.name}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: kindColor, color: '#fff', whiteSpace: 'nowrap' }}>{kindLabel}</span>
                      {!sub.is_active && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: 'var(--text-muted)', color: '#fff' }}>已暂停</span>}
                    </div>
                    <div className="subscription-query">
                      <Icon name="key" />{queryLabel}: <span>{queryDisplay}</span>
                    </div>
                    <div className="subscription-meta">
                      创建于 {new Date(sub.created_at).toLocaleDateString('zh-CN')}
                      {sub.last_checked_at && ` · 上次拉取 ${new Date(sub.last_checked_at).toLocaleDateString('zh-CN')}`}
                      · 上限 {sub.fetch_limit}
                      {sub.last_error && (
                        <span
                          title={sub.last_error}
                          style={{ color: 'var(--accent-red)', marginLeft: 8 }}
                        >
                          ⚠ {sub.last_error.slice(0, 140)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="subscription-actions">
                    <button
                      className="btn btn-action"
                      onClick={() => isEditing ? handleCancelEdit() : handleStartEdit(sub)}
                    >
                      <Icon name="key" />{isEditing ? '取消' : '编辑'}
                    </button>
                    <button
                      className="btn btn-action"
                      onClick={() => handleToggleActive(sub)}
                    >
                      {sub.is_active ? '暂停' : '启用'}
                    </button>
                    <button
                      className="btn btn-action"
                      onClick={() => handleFetch(sub.id)}
                      disabled={fetchingId === sub.id}
                    >
                      {fetchingId === sub.id ? <><span className="spinner" />拉取中...</> : <><Icon name="download" />拉取最新</>}
                    </button>
                    <button
                      className="btn btn-action"
                      onClick={() => handleDelete(sub.id)}
                      data-danger="true"
                    >
                      删除
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="subscription-create-card" style={{ marginTop: 12, borderLeft: '3px solid var(--accent-blue, #3b82f6)' }}>
                    <div className="form-group">
                      <label>订阅名称</label>
                      <input value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>订阅源类型</label>
                      <select
                        value={editSourceKind}
                        onChange={e => { setEditSourceKind(e.target.value); setEditQuery(''); setEditConfig({}) }}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-layer-1)', color: 'var(--text-primary)', fontSize: 14 }}
                      >
                        {SOURCE_KIND_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                        ))}
                      </select>
                    </div>

                    {(editSourceKind === 'arxiv') && (
                      <div className="form-group">
                        <label>arXiv 搜索关键词</label>
                        <input value={editQuery} onChange={e => setEditQuery(e.target.value)} placeholder="如: cat:cs.LG" />
                      </div>
                    )}
                    {(editSourceKind === 'rss') && (
                      <div className="form-group">
                        <label>RSS / Atom Feed URL</label>
                        <input value={editQuery} onChange={e => setEditQuery(e.target.value)} placeholder="如: https://rss.arxiv.org/rss/cs.AI" />
                      </div>
                    )}
                    {(editSourceKind === 'openreview') && (
                      <>
                        <div className="form-group">
                          <label>会议 Venue ID（二选一）</label>
                          <input value={editConfig.venue || ''} onChange={e => setEditConfig(c => ({ ...c, venue: e.target.value }))} placeholder="如: ICLR.cc/2026/Conference" />
                        </div>
                        <div className="form-group">
                          <label>Invitation（二选一）</label>
                          <input value={editConfig.invitation || ''} onChange={e => setEditConfig(c => ({ ...c, invitation: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>关键词过滤（可选）</label>
                          <input value={editQuery} onChange={e => setEditQuery(e.target.value)} placeholder="如: diffusion（空格分隔多个关键词，需全部命中）" />
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            留空则订阅会议全部论文；填写后只保留标题 / 摘要 / 关键词包含全部关键词的论文。
                          </div>
                        </div>
                      </>
                    )}
                    {(editSourceKind === 'hf_papers') && (
                      <div className="form-group">
                        <label>页面 URL（可选）</label>
                        <input value={editConfig.url || ''} onChange={e => setEditConfig(c => ({ ...c, url: e.target.value }))} placeholder="https://huggingface.co/papers" />
                      </div>
                    )}
                    {(editSourceKind === 'github_trending') && (
                      <>
                        <div className="form-group">
                          <label>编程语言（可选）</label>
                          <input value={editConfig.language || ''} onChange={e => setEditConfig(c => ({ ...c, language: e.target.value }))} placeholder="如: python" />
                        </div>
                        <div className="form-group">
                          <label>时间范围</label>
                          <select
                            value={editConfig.since || 'daily'}
                            onChange={e => setEditConfig(c => ({ ...c, since: e.target.value }))}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-layer-1)', color: 'var(--text-primary)', fontSize: 14 }}
                          >
                            <option value="daily">今日</option>
                            <option value="weekly">本周</option>
                            <option value="monthly">本月</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div className="form-group">
                      <label>每次拉取上限</label>
                      <input type="number" min={1} max={20} value={editFetchLimit} onChange={e => setEditFetchLimit(Math.max(1, Math.min(20, Number(e.target.value) || 10)))} />
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={handleSaveEdit} disabled={!isEditValid() || savingEdit}>
                        {savingEdit ? '保存中...' : '保存修改'}
                      </button>
                      <button className="btn btn-action" onClick={handleCancelEdit}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Fetch Results */}
      {fetchResults.length > 0 && (
        <section className="glass-card subscription-card">
          <h3 className="subscription-section-title"><Icon name="fileText" />拉取结果 ({fetchResults.length} 篇)</h3>
          <div className="subscription-result-list">
            {fetchResults.map((paper, i) => (
              <ArxivPaperCard key={i} paper={paper} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ArxivPaperCard({ paper }: { paper: ArxivPaper }) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    if (adding || added) return
    setAdding(true)
    try {
      await importPaperFromUrl({
        title: paper.title,
        source: 'arxiv',
        source_id: paper.arxiv_id,
        url: paper.pdf_url,
        authors: paper.authors,
        abstract: paper.abstract,
        published_at: paper.published,
      })
      setAdded(true)
    } catch {
      alert('添加失败，请重试')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="paper-item" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
      <div className="paper-item-title" style={{ marginBottom: 6 }}>{paper.title}</div>
      <div className="arxiv-authors">
        <Icon name="file" /> {paper.authors.length > 80 ? paper.authors.slice(0, 80) + '...' : paper.authors}
      </div>
      <div className="paper-item-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="paper-source">{paper.arxiv_id}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {paper.published ? new Date(paper.published).toLocaleDateString('zh-CN') : ''}
          </span>
          {paper.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, color: 'var(--accent-blue)' }}
            >
              <Icon name="download" /> 首发 PDF
            </a>
          )}
        </div>
        <button
          className={`btn ${added ? 'btn-primary' : 'btn-action'}`}
          onClick={handleAdd}
          disabled={adding || added || !paper.pdf_url}
          style={{ height: 28, fontSize: 12, padding: '0 12px', minWidth: 80, width: 'auto' }}
        >
          {added ? <><Icon name="check" />已添加到论文库</> : adding ? <><span className="spinner" />添加中...</> : '+ 添加到论文库'}
        </button>
      </div>
      {expanded && paper.abstract && (
        <div style={{ marginTop: 12, padding: 16, background: 'var(--bg-layer-1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>摘要</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{paper.abstract}</div>
        </div>
      )}
    </div>
  )
}
