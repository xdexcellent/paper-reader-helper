import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchRecommendations, type RecommendationItem } from '../lib/api'
import type { Paper } from '../types'
import { Icon } from './UiIcon'

let cachedRecommendations: RecommendationItem[] | null = null;
let lastFetchTime = 0;

export function RecommendationShell({ papers }: { papers: Paper[] }) {
  const navigate = useNavigate()
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(cachedRecommendations || [])
  const [loading, setLoading] = useState(!cachedRecommendations)

  useEffect(() => {
    async function load() {
      if (cachedRecommendations && Date.now() - lastFetchTime < 60000) {
        setRecommendations(cachedRecommendations)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const data = await fetchRecommendations()
        cachedRecommendations = data
        lastFetchTime = Date.now()
        setRecommendations(data)
      } catch {
        // Fallback to local scoring
        const scored = [...papers]
          .map(p => {
            let score = 0
            if (p.status === 'ready') score += 100
            else if (p.status === 'parsed') score += 80
            else score += 20
            if (p.summary_status === 'completed') score += 30
            if (p.parse_status === 'completed' && p.summary_status === 'pending') score += 50
            return { paper: p, score, reason: p.status === 'ready' ? '已就绪，建议阅读' : '待处理' }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
        cachedRecommendations = scored
        lastFetchTime = Date.now()
        setRecommendations(scored)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [papers])

  if (loading) {
    return (
      <section className="panel-card recommendation-shell">
        <div className="paper-detail-loading" style={{ minHeight: 200 }}>
          <div className="loading-spinner" />
          <span>正在生成推荐...</span>
        </div>
      </section>
    )
  }

  return (
    <section className="panel-card recommendation-shell">
      <header className="panel-header">
        <div>
          <h2>个性化论文推荐</h2>
          <p>基于论文处理状态与内容分析，推荐优先阅读的论文</p>
        </div>
        <span className="panel-chip">AI 驱动</span>
      </header>

      {recommendations.length === 0 ? (
        <div className="briefing-empty">暂无可推荐论文，请先导入并解析。</div>
      ) : (
        <div className="recommendation-grid">
          {recommendations.map((item, index) => (
            <article
              key={item.paper.id}
              className="recommendation-card"
              onClick={() => navigate(`/paper/${item.paper.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="recommendation-header">
                <div className="recommendation-badges">
                  <span className="recommendation-rank">推荐 #{index + 1}</span>
                  {item.tag && <span className="recommendation-tag">{item.tag}</span>}
                </div>
                <div className="recommendation-icon">
                  <Icon name={index === 0 ? 'target' : 'fileText'} />
                </div>
              </div>
              
              <h3>{item.paper.title}</h3>
              
              <div className="recommendation-body">
                <p className="recommendation-reason">{item.reason}</p>
                {item.future_direction && (
                  <div className="recommendation-future">
                    <div className="recommendation-future-title">
                      <Icon name="target" /> 未来研究方向
                    </div>
                    <p className="recommendation-future-text">{item.future_direction}</p>
                  </div>
                )}
              </div>
              
              <div className="recommendation-meta-bottom">
                <span>来源: {item.paper.source}</span>
                <span>状态: {item.paper.status === 'ready' ? '已就绪' : '待处理'}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
