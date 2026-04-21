import { useState, useEffect } from 'react'
import { fetchStatsOverview, fetchDailyStats, fetchSourceDist } from '../lib/api'
import type { StatsOverview, DailyStatsItem, SourceDistItem } from '../lib/api'
import type { Paper } from '../types'

export function StatsShell({ papers }: { papers: Paper[] }) {
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [dailyData, setDailyData] = useState<DailyStatsItem[]>([])
  const [sources, setSources] = useState<SourceDistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [overview, daily, src] = await Promise.all([
          fetchStatsOverview(),
          fetchDailyStats(7),
          fetchSourceDist(),
        ])
        setStats(overview)
        setDailyData(daily)
        setSources(src)
      } catch {
        // Use local fallback
        const total = papers.length
        const ready = papers.filter(p => p.status === 'ready').length
        const parsed = papers.filter(p => p.parse_status === 'completed').length
        const summarized = papers.filter(p => p.summary_status === 'completed').length
        setStats({
          total, ready, parsed, summarized,
          pending: papers.filter(p => p.status === 'queued').length,
          processing: papers.filter(p => p.status === 'parsing' || p.status === 'summarizing').length,
          completion_rate: total > 0 ? Math.round((ready / total) * 100) : 0,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [papers])

  if (loading || !stats) {
    return (
      <section className="stats-shell">
        <div className="paper-detail-loading">
          <div className="loading-spinner" />
          <span>加载统计数据...</span>
        </div>
      </section>
    )
  }

  const maxDaily = Math.max(...dailyData.map(d => d.count), 1)

  return (
    <section className="stats-shell">
      <header className="stats-page-header">
        <h1>学术追踪</h1>
        <p>追踪论文处理进度，洞察研究产出趋势</p>
      </header>

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-label">总文章数</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-note">当前论文库已收录总量</div>
        </article>

        <article className="stat-card">
          <div className="stat-label">处理完毕</div>
          <div className="stat-value">{stats.ready}</div>
          <div className="stat-note">整体完成率已达 <strong>{stats.completion_rate}%</strong></div>
        </article>

        <article className="stat-card">
          <div className="stat-label">结构提取</div>
          <div className="stat-value">{stats.parsed}</div>
          <div className="stat-note">论文正文已成功提取</div>
        </article>
      </div>

      <div className="stats-extra-grid">
        <article className="stat-card small">
          <div className="stat-label">摘要生成</div>
          <div className="stat-value-small">{stats.summarized}</div>
        </article>
        <article className="stat-card small">
          <div className="stat-label">待处理队列</div>
          <div className="stat-value-small">{stats.pending}</div>
        </article>
        <article className="stat-card small">
          <div className="stat-label">正在进行中</div>
          <div className="stat-value-small">{stats.processing}</div>
        </article>
      </div>

      {sources.length > 0 && (
        <article className="stats-chart-card">
          <h3>来源分布</h3>
          <div className="source-distribution">
            {sources.map(s => (
              <span key={s.source} className="source-tag">{s.source}: {s.count} 篇</span>
            ))}
          </div>
        </article>
      )}

      {dailyData.length > 0 && (
        <article className="stats-chart-card">
          <h3>近7日导入趋势</h3>
          <div className="mini-bar-chart" aria-hidden="true">
            {dailyData.map((item, index) => (
              <span
                key={item.date}
                className={index === dailyData.length - 1 ? 'active' : ''}
                style={{ height: `${Math.max(5, (item.count / maxDaily) * 100)}%` }}
                title={`${item.date}: ${item.count} 篇`}
              />
            ))}
          </div>
          <div className="chart-labels">
            {dailyData.map(item => (
              <span key={item.date} className="chart-label">{item.date.slice(5)}</span>
            ))}
          </div>
        </article>
      )}
    </section>
  )
}