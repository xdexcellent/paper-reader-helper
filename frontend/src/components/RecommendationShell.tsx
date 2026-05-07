import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchRecommendations, type RecommendationItem } from '../lib/api'
import type { Paper } from '../types'
import { Icon, type IconName } from './UiIcon'

// Daily cache keyed by (date|paperHash|model). Only refetches if any key changes
// or user explicitly forces refresh.
interface RecommendationCacheEntry {
  signature: string
  data: RecommendationItem[]
}
let recommendationCache: RecommendationCacheEntry | null = null

const AVAILABLE_MODELS = ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2'] as const
const DEFAULT_MODEL = 'gpt-5.4'

function buildCacheSignature(papers: Paper[], model: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const paperHash = papers
    .map(p => JSON.stringify({
      id: p.id,
      title: p.title,
      source: p.source,
      status: p.status,
      parse_status: p.parse_status,
      summary_status: p.summary_status,
      embedding_status: p.embedding_status,
      category_status: p.category_status ?? '',
      tags: [...(p.tags ?? [])].sort(),
      updated_at: p.updated_at ?? '',
    }))
    .sort()
    .join('|')
  return `${today}::${model}::${paperHash}`
}

type RecommendationViewItem = RecommendationItem & {
  category: string
  category_label: string
  status_label: string
  action_label: string
  action_hint: string
  confidence: number
  signals: string[]
  score_breakdown: string[]
  tag: string
  future_direction: string
  priority_icon: IconName
}

const categoryOrder = ['all', 'read_now', 'summarize_next', 'process_next', 'recover']
const categoryLabels: Record<string, string> = {
  all: '全部推荐',
  read_now: '优先阅读',
  summarize_next: '补充摘要',
  process_next: '推进处理',
  recover: '修复处理',
}

export function RecommendationShell({ papers }: { papers: Paper[] }) {
  const navigate = useNavigate()
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(recommendationCache?.data || [])
  const [loading, setLoading] = useState(!recommendationCache)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL)
  const [refreshing, setRefreshing] = useState(false)
  const deferredQuery = useDeferredValue(query)

  async function loadRecommendations(force = false) {
    const signature = buildCacheSignature(papers, selectedModel)
    if (!force && recommendationCache && recommendationCache.signature === signature) {
      setRecommendations(recommendationCache.data)
      setLoading(false)
      return
    }
    if (force) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    try {
      const data = await fetchRecommendations({ force, model: selectedModel })
      recommendationCache = { signature, data }
      setRecommendations(data)
    } catch (err) {
      const fallback = buildLocalRecommendations(papers)
      recommendationCache = { signature, data: fallback }
      setRecommendations(fallback)
      setError(err instanceof Error ? err.message : '推荐服务暂不可用，已使用本地规则生成。')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadRecommendations(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, selectedModel])

  const viewItems = recommendations.map(normalizeRecommendation)
  const categoryCounts = categoryOrder.reduce<Record<string, number>>((acc, category) => {
    acc[category] = category === 'all'
      ? viewItems.length
      : viewItems.filter(item => item.category === category).length
    return acc
  }, {})
  const queryText = deferredQuery.trim().toLowerCase()
  const filteredItems = viewItems.filter(item => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory
    if (!matchesCategory) return false
    if (!queryText) return true
    return [
      item.paper.title,
      item.reason,
      item.tag,
      item.category_label,
      ...item.signals,
    ].join(' ').toLowerCase().includes(queryText)
  })
  const selectedItem =
    filteredItems.find(item => item.paper.id === selectedPaperId)
    || filteredItems[0]
    || viewItems[0]

  useEffect(() => {
    if (selectedPaperId === null && viewItems.length > 0) {
      setSelectedPaperId(viewItems[0].paper.id)
    }
  }, [selectedPaperId, viewItems])

  if (loading) {
    return (
      <section className="panel-card recommendation-shell recommendation-intel-shell">
        <div className="paper-detail-loading" style={{ minHeight: 260 }}>
          <div className="loading-spinner" />
          <span>正在生成推荐...</span>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-card recommendation-shell recommendation-intel-shell">
      <header className="recommendation-hero">
        <div>
          <span className="recommendation-kicker">AI Reading Radar</span>
          <h2>个性化论文推荐</h2>
          <p>每天首次访问时生成；论文有更新或手动刷新时重新生成。</p>
        </div>
        <div className="recommendation-controls">
          <label className="recommendation-model-picker">
            <span>模型</span>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={refreshing}
              aria-label="选择推荐模型"
            >
              {AVAILABLE_MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-action"
            onClick={() => void loadRecommendations(true)}
            disabled={refreshing}
            aria-label="重新生成推荐"
          >
            <Icon name="refresh" />
            {refreshing ? '生成中…' : '重新生成'}
          </button>
        </div>
        <div className="recommendation-metrics" aria-label="推荐概览">
          <div>
            <strong>{viewItems.length}</strong>
            <span>候选</span>
          </div>
          <div>
            <strong>{categoryCounts.read_now || 0}</strong>
            <span>可读</span>
          </div>
          <div>
            <strong>{categoryCounts.recover || 0}</strong>
            <span>需修复</span>
          </div>
        </div>
      </header>

      {error ? (
        <p className="recommendation-feedback">
          推荐 API 暂不可用：{error}。当前展示为本地规则推荐。
        </p>
      ) : null}

      {viewItems.length === 0 ? (
        <div className="briefing-empty">暂无可推荐论文，请先导入并解析。</div>
      ) : (
        <>
          <div className="recommendation-toolbar">
            <label className="recommendation-search">
              <Icon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、标签、推荐信号..."
                aria-label="搜索推荐论文"
              />
            </label>
            <div className="recommendation-filter-tabs" aria-label="推荐类型筛选">
              {categoryOrder.map(category => (
                <button
                  key={category}
                  type="button"
                  className={activeCategory === category ? 'active' : ''}
                  onClick={() => startTransition(() => setActiveCategory(category))}
                  disabled={category !== 'all' && !categoryCounts[category]}
                >
                  {categoryLabels[category]}
                  <span>{categoryCounts[category] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="briefing-empty">没有匹配当前筛选条件的推荐。</div>
          ) : (
            <div className="recommendation-intel-grid">
              <div className="recommendation-list" aria-label="推荐论文列表">
                {filteredItems.map((item, index) => (
                  <button
                    key={item.paper.id}
                    type="button"
                    className={`recommendation-card ${selectedItem?.paper.id === item.paper.id ? 'selected' : ''}`}
                    onClick={() => setSelectedPaperId(item.paper.id)}
                  >
                    <div className="recommendation-header">
                      <div className="recommendation-badges">
                        <span className="recommendation-rank">#{index + 1}</span>
                        <span className="recommendation-tag">{item.category_label}</span>
                        {item.tag ? <span className="recommendation-tag muted">{item.tag}</span> : null}
                      </div>
                      <div className="recommendation-icon">
                        <Icon name={item.priority_icon} />
                      </div>
                    </div>

                    <h3>{item.paper.title}</h3>
                    <p className="recommendation-reason">{item.reason}</p>

                    <div className="recommendation-signal-row">
                      {item.signals.slice(0, 3).map(signal => (
                        <span key={signal}>{signal}</span>
                      ))}
                    </div>

                    <div className="recommendation-meta-bottom">
                      <span>{item.status_label}</span>
                      <span>置信度 {item.confidence}%</span>
                      <span>分数 {Math.round(item.score)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedItem ? (
                <aside className="recommendation-focus-panel" aria-label="推荐详情">
                  <div className="recommendation-focus-header">
                    <span>{selectedItem.category_label}</span>
                    <strong>{selectedItem.confidence}%</strong>
                  </div>
                  <h3>{selectedItem.paper.title}</h3>
                  <p>{selectedItem.action_hint}</p>

                  <div className="recommendation-focus-block">
                    <h4>为什么推荐</h4>
                    <p>{selectedItem.reason}</p>
                  </div>

                  {selectedItem.future_direction ? (
                    <div className="recommendation-focus-block accent">
                      <h4>延伸方向</h4>
                      <p>{selectedItem.future_direction}</p>
                    </div>
                  ) : null}

                  <div className="recommendation-focus-block">
                    <h4>命中信号</h4>
                    <div className="recommendation-chip-cloud">
                      {selectedItem.signals.map(signal => (
                        <span key={signal}>{signal}</span>
                      ))}
                    </div>
                  </div>

                  <div className="recommendation-focus-block">
                    <h4>评分拆解</h4>
                    <ul className="recommendation-score-list">
                      {selectedItem.score_breakdown.map(signal => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary recommendation-open-btn"
                    onClick={() => navigate(`/paper/${selectedItem.paper.id}`)}
                  >
                    {selectedItem.action_label}
                  </button>
                </aside>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function normalizeRecommendation(item: RecommendationItem): RecommendationViewItem {
  const category = item.category || categoryForPaper(item.paper)
  return {
    ...item,
    category,
    category_label: item.category_label || categoryLabels[category] || '推荐',
    status_label: item.status_label || statusLabel(item.paper),
    action_label: item.action_label || actionLabel(item.paper),
    action_hint: item.action_hint || actionHint(item.paper),
    confidence: item.confidence ?? confidenceFromScore(item.score),
    signals: item.signals?.length ? item.signals : signalsForPaper(item.paper),
    score_breakdown: item.score_breakdown?.length ? item.score_breakdown : scoreBreakdownForPaper(item.paper),
    tag: item.tag || item.paper.tags?.[0] || item.paper.source,
    future_direction: item.future_direction || futureDirectionForPaper(item.paper),
    priority_icon: iconName(item.priority_icon || iconForCategory(category)),
  }
}

function buildLocalRecommendations(papers: Paper[]): RecommendationItem[] {
  return [...papers]
    .map(paper => {
      const category = categoryForPaper(paper)
      let score = 20
      if (paper.status === 'ready') score += 100
      if (paper.status === 'parsed') score += 80
      if (paper.summary_status === 'completed') score += 30
      if (paper.parse_status === 'completed' && paper.summary_status === 'pending') score += 50
      if (paper.category_status === 'manual_locked') score += 18
      if ((paper.tags?.length || 0) > 0) score += Math.min(paper.tags?.length || 0, 3) * 4

      return {
        paper,
        score,
        reason: reasonForPaper(paper),
        tag: paper.tags?.[0] || paper.source,
        priority_icon: iconForCategory(category),
        future_direction: futureDirectionForPaper(paper),
        category,
        category_label: categoryLabels[category],
        status_label: statusLabel(paper),
        action_label: actionLabel(paper),
        action_hint: actionHint(paper),
        confidence: confidenceFromScore(score),
        signals: signalsForPaper(paper),
        score_breakdown: scoreBreakdownForPaper(paper),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

function categoryForPaper(paper: Paper): string {
  if (paper.status === 'ready' && paper.summary_status === 'completed') return 'read_now'
  if (paper.status === 'parse_failed' || paper.status === 'summarize_failed' || paper.parse_status === 'failed') return 'recover'
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') return 'summarize_next'
  return 'process_next'
}

function statusLabel(paper: Paper): string {
  if (paper.status === 'ready') return '已就绪'
  if (paper.status === 'parsed') return '已解析'
  if (paper.status === 'parse_failed') return '解析失败'
  if (paper.status === 'summarize_failed') return '摘要失败'
  if (paper.status === 'parsing') return '解析中'
  if (paper.status === 'summarizing') return '摘要中'
  return '待处理'
}

function actionLabel(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '开始阅读'
  if (category === 'summarize_next') return '生成摘要'
  if (category === 'recover') return '查看并重试'
  return '打开处理'
}

function actionHint(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '已有摘要和状态信号，适合作为当前阅读入口。'
  if (category === 'summarize_next') return '正文已解析完成，补齐摘要后推荐质量会明显提高。'
  if (category === 'recover') return '处理流程失败，建议先进入详情页修复，避免漏掉潜在重要论文。'
  return '论文仍在队列或处理中，进入详情页可以查看当前进度。'
}

function reasonForPaper(paper: Paper): string {
  const category = categoryForPaper(paper)
  if (category === 'read_now') {
    return paper.tags?.length
      ? `已完成摘要，并带有“${paper.tags.slice(0, 2).join('、')}”标签，适合优先阅读。`
      : '已完成解析和摘要，信息完整度高，适合作为当前阅读对象。'
  }
  if (category === 'summarize_next') return '正文已解析但缺少中文摘要，补齐后能更快判断是否值得深读。'
  if (category === 'recover') return '处理流程失败但仍保留候选信息，建议先修复再进入阅读队列。'
  return '论文已进入处理流程，可作为下一批推进对象。'
}

function futureDirectionForPaper(paper: Paper): string {
  if (paper.tags?.length) return `可围绕“${paper.tags.slice(0, 2).join('、')}”继续检索相邻主题论文。`
  const category = categoryForPaper(paper)
  if (category === 'read_now') return '阅读后补充标签和主分类，后续推荐会更贴近你的研究方向。'
  if (category === 'summarize_next') return '生成摘要后再做语义检索，判断它与已读论文的关系。'
  if (category === 'recover') return '先完成修复，再纳入每日速览或语义推荐链路。'
  return '完成解析和摘要后，推荐系统会给出更具体的研究价值判断。'
}

function signalsForPaper(paper: Paper): string[] {
  const signals = [statusLabel(paper)]
  if (paper.summary_status === 'completed') signals.push('已有中文摘要')
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') signals.push('适合补摘要')
  if (paper.category_status === 'manual_locked') signals.push('人工确认分类')
  if ((paper.category_confidence ?? 0) >= 0.85) signals.push('分类置信度高')
  if (paper.tags?.length) signals.push(`标签：${paper.tags.slice(0, 2).join('、')}`)
  return signals
}

function scoreBreakdownForPaper(paper: Paper): string[] {
  const items = [statusLabel(paper)]
  if (paper.summary_status === 'completed') items.push('摘要完成加权')
  if (paper.parse_status === 'completed' && paper.summary_status !== 'completed') items.push('待补摘要加权')
  if (paper.category_status === 'manual_locked') items.push('人工确认加权')
  if (paper.tags?.length) items.push('标签信号加权')
  return items
}

function confidenceFromScore(score: number): number {
  if (score >= 180) return 96
  if (score >= 140) return 88
  if (score >= 100) return 76
  if (score >= 70) return 62
  return 48
}

function iconForCategory(category: string): IconName {
  if (category === 'read_now') return 'target'
  if (category === 'summarize_next') return 'spark'
  if (category === 'recover') return 'warning'
  return 'fileText'
}

function iconName(value?: string): IconName {
  if (value === 'target' || value === 'spark' || value === 'warning' || value === 'vector' || value === 'fileText') {
    return value
  }
  return 'fileText'
}
