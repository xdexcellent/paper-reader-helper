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
  query: string
  is_active: boolean
  last_checked_at: string | null
  created_at: string
}

interface ArxivPaper {
  title: string
  authors: string
  abstract: string
  pdf_url: string
  arxiv_id: string
  published: string
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
  const [newQuery, setNewQuery] = useState('')

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

  async function handleCreate() {
    if (!newName.trim() || !newQuery.trim()) return
    try {
      const res = await fetch(`${API_BASE}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newName, type: 'arxiv', query: newQuery }),
      })
      if (res.ok) {
        setShowCreate(false)
        setNewName('')
        setNewQuery('')
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
              <label>订阅名称</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如: Diffusion Models 最新论文" />
            </div>
            <div className="form-group">
              <label>arXiv 搜索关键词</label>
              <input value={newQuery} onChange={e => setNewQuery(e.target.value)} placeholder="如: diffusion model image generation" />
            </div>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim() || !newQuery.trim()}>
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
            {subscriptions.map(sub => (
              <article key={sub.id} className="subscription-item">
                <div className="subscription-item-main">
                  <div>
                    <div className="paper-item-title" style={{ marginBottom: 4 }}>{sub.name}</div>
                    <div className="subscription-query">
                      <Icon name="key" />关键词: <span>{sub.query}</span>
                    </div>
                    <div className="subscription-meta">
                      创建于 {new Date(sub.created_at).toLocaleDateString('zh-CN')}
                      {sub.last_checked_at && ` · 上次拉取 ${new Date(sub.last_checked_at).toLocaleDateString('zh-CN')}`}
                    </div>
                  </div>
                  <div className="subscription-actions">
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
              </article>
            ))}
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
