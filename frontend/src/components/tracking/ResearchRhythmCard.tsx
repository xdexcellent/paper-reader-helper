import type { DailyStatsItem } from '../../lib/api'
import { Activity } from 'lucide-react'

export type ResearchRhythmCardProps = {
  dailyData: DailyStatsItem[]
  loading?: boolean
  rangeDays?: number
}

/**
 * 研究节奏卡片 — 展示日均导入量、活跃天数、峰值日导入量
 */
export function ResearchRhythmCard({ dailyData, loading, rangeDays = 7 }: ResearchRhythmCardProps) {
  // Calculate metrics
  const totalCount = dailyData.reduce((sum, d) => sum + d.count, 0)
  const dailyAvg = dailyData.length > 0 ? (totalCount / rangeDays).toFixed(1) : '0.0'
  const activeDays = dailyData.filter((d) => d.count > 0).length
  const peakCount =
    dailyData.length > 0 ? Math.max(...dailyData.map((d) => d.count)) : 0
  const latestCount = dailyData.length > 0 ? dailyData[dailyData.length - 1]?.count ?? 0 : 0
  const rhythmSummary =
    activeDays >= 5
      ? `过去 ${rangeDays} 天保持稳定研究节奏，${activeDays} 天有导入记录，最新日导入 ${latestCount} 篇。`
      : `过去 ${rangeDays} 天共有 ${activeDays} 天有导入记录，可继续补充订阅源以提高覆盖。`

  const isEmpty = dailyData.length === 0

  return (
    <div className="tracking-panel" style={cardStyle}>
      <div style={titleRowStyle}>
        <span style={pulseIconStyle}><Activity size={15} /></span>
        <h3 style={titleStyle}>研究节奏</h3>
      </div>

      {loading ? (
        <div style={skeletonContainerStyle}>
          <div style={skeletonRowStyle}>
            <div style={skeletonBlockStyle} />
            <div style={skeletonBlockStyle} />
            <div style={skeletonBlockStyle} />
          </div>
        </div>
      ) : isEmpty ? (
        <div style={emptyStyle}>暂无导入记录，开始导入论文后将展示研究节奏数据</div>
      ) : (
        <>
          <p style={summaryStyle}>{rhythmSummary}</p>
          <div style={metricsRowStyle}>
            <div style={metricItemStyle}>
              <span style={metricValueStyle}>{dailyAvg}</span>
              <span style={metricLabelStyle}>日均导入量</span>
            </div>
            <div style={metricItemStyle}>
              <span style={metricValueStyle}>{activeDays}</span>
              <span style={metricLabelStyle}>活跃天数</span>
            </div>
            <div style={metricItemStyle}>
              <span style={metricValueStyle}>{peakCount}</span>
              <span style={metricLabelStyle}>峰值日导入量</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-card)',
  padding: '20px 22px',
  minHeight: '188px',
  transition:
    'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: 800,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: 0,
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '12px',
}

const pulseIconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#EEF2FF',
  color: '#2563EB',
  fontSize: '18px',
  fontWeight: 800,
}

const summaryStyle: React.CSSProperties = {
  margin: '0 0 18px',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  lineHeight: 1.7,
}

const metricsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '18px',
  flexWrap: 'wrap',
}

const metricItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: '1 1 0',
  minWidth: '80px',
  paddingLeft: '18px',
  borderLeft: '1px solid var(--border-subtle)',
}

const metricValueStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  lineHeight: 1.2,
  color: 'var(--text-primary)',
  letterSpacing: 0,
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

const emptyStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--text-muted)',
  padding: '16px 0',
}

// Skeleton styles
const skeletonContainerStyle: React.CSSProperties = {
  padding: '4px 0',
}

const skeletonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '24px',
}

const skeletonBlockStyle: React.CSSProperties = {
  flex: '1 1 0',
  height: '48px',
  borderRadius: '6px',
  background:
    'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}
