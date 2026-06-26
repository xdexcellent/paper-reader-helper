import type { SourceDistItem } from '../../lib/api'

export type SourceDistributionCardProps = {
  sources: SourceDistItem[]
  loading?: boolean
  onViewDetails?: () => void
}

/** Predefined color palette for the stacked bar (max 6 distinct colors) */
const BAR_COLORS = [
  '#2563EB', // blue
  '#14B8A6', // cyan
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // orange
  '#EF4444', // red
]

/** Max visible source chips */
const MAX_CHIPS = 10
/** Max distinct colors in stacked bar */
const MAX_BAR_SEGMENTS = 6

export function SourceDistributionCard({ sources, loading, onViewDetails }: SourceDistributionCardProps) {
  if (loading) {
    return (
      <div className="tracking-panel tracking-panel--source" style={cardStyle}>
        <PanelHeader title="来源分布" action="查看详情" onAction={onViewDetails} />
        <div style={skeletonChipsStyle}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={skeletonChipStyle} />
          ))}
        </div>
        <div style={skeletonBarStyle} />
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="tracking-panel tracking-panel--source" style={cardStyle}>
        <PanelHeader title="来源分布" action="查看详情" onAction={onViewDetails} />
        <div style={emptyStyle}>
          <p style={emptyTitleStyle}>暂无来源数据</p>
          <p style={emptyHintStyle}>完成论文导入后将展示渠道占比。</p>
        </div>
      </div>
    )
  }

  const total = sources.reduce((sum, s) => sum + s.count, 0)
  const visibleChips = sources.slice(0, MAX_CHIPS)
  const overflowChipCount = sources.length - MAX_CHIPS

  // For the stacked bar, show up to 6 segments; merge the rest into "其他"
  const barSegments = buildBarSegments(sources, total)

  return (
    <div className="tracking-panel tracking-panel--source" style={cardStyle}>
      <PanelHeader title="来源分布" action="查看详情" onAction={onViewDetails} />

      {/* Source chips */}
      <div style={chipsContainerStyle}>
        {visibleChips.map((s) => (
          <span key={s.source} style={chipStyle}>
            {s.source}
            <span style={chipCountStyle}>{s.count}</span>
            <span style={chipPercentStyle}>
              {total > 0 ? `${((s.count / total) * 100).toFixed(1)}%` : '0%'}
            </span>
          </span>
        ))}
        {overflowChipCount > 0 && (
          <span style={chipOverflowStyle}>+{overflowChipCount} 个其他</span>
        )}
      </div>

      {/* Stacked progress bar */}
      <div style={barContainerStyle} role="img" aria-label="来源占比分布">
        {barSegments.map((seg, i) => (
          <div
            key={seg.label}
            className="source-bar-seg"
            style={{
              ...barSegmentStyle,
              width: `${seg.percent}%`,
              background: seg.color,
              animationDelay: `${i * 0.06}s`,
            }}
            title={`${seg.label}: ${seg.percent.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={legendContainerStyle}>
        {barSegments.map((seg) => (
          <span key={seg.label} style={legendItemStyle}>
            <span style={{ ...legendDotStyle, background: seg.color }} />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function PanelHeader({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  return (
    <div style={panelHeaderStyle}>
      <h3 style={titleStyle}>{title}</h3>
      <button type="button" style={panelActionStyle} onClick={onAction}>
        {action} →
      </button>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

type BarSegment = { label: string; percent: number; color: string }

function buildBarSegments(sources: SourceDistItem[], total: number): BarSegment[] {
  if (total === 0) return []

  const segments: BarSegment[] = []
  const sorted = [...sources].sort((a, b) => b.count - a.count)

  const topSources = sorted.slice(0, MAX_BAR_SEGMENTS)
  const overflowSources = sorted.slice(MAX_BAR_SEGMENTS)

  topSources.forEach((s, i) => {
    segments.push({
      label: s.source,
      percent: (s.count / total) * 100,
      color: BAR_COLORS[i],
    })
  })

  if (overflowSources.length > 0) {
    const overflowCount = overflowSources.reduce((sum, s) => sum + s.count, 0)
    segments.push({
      label: '其他',
      percent: (overflowCount / total) * 100,
      color: '#94A3B8', // muted gray for overflow
    })
  }

  return segments
}

// ─── Styles ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-card)',
  padding: '20px 22px',
  minHeight: '188px',
  transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: 800,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: 0,
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '16px',
}

const panelActionStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#4F46E5',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700,
  padding: 0,
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '24px 0',
}

const emptyTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: 'var(--text-muted)',
}

const emptyHintStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: '12px',
  color: 'var(--text-weak)',
}

const chipsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginBottom: '15px',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '999px',
  background: '#EFF6FF',
  border: '1px solid #DBEAFE',
  fontSize: '12px',
  fontWeight: 500,
  color: '#1D4ED8',
  whiteSpace: 'nowrap',
}

const chipCountStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  background: 'var(--bg-panel)',
  borderRadius: '999px',
  padding: '1px 6px',
  border: '1px solid var(--border-subtle)',
}

const chipPercentStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#0F766E',
}

const chipOverflowStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--bg-selected)',
  color: 'var(--accent-blue)',
  borderColor: 'var(--accent-blue-soft, #DBEAFE)',
}

const barContainerStyle: React.CSSProperties = {
  display: 'flex',
  height: '16px',
  borderRadius: '7px',
  overflow: 'hidden',
  background: 'var(--bg-muted)',
  marginBottom: '12px',
}

const barSegmentStyle: React.CSSProperties = {
  height: '100%',
  transition: 'width var(--transition-normal)',
}

const legendContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
}

const legendItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  color: 'var(--text-muted)',
}

const legendDotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
}

// Skeleton styles
const skeletonChipsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
}

const skeletonBase: React.CSSProperties = {
  borderRadius: '4px',
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}

const skeletonChipStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '72px',
  height: '26px',
  borderRadius: '999px',
}

const skeletonBarStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '100%',
  height: '8px',
  borderRadius: '4px',
}
