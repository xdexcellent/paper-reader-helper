import { useState } from 'react'
import type { SourceDistItem } from '../../lib/api'
import { clampTooltipX, SvgChartTooltip } from './ChartTooltip'

export type TopicDistributionCardProps = {
  sources: SourceDistItem[]
  loading?: boolean
  onViewAll?: () => void
}

/** Color palette matching SourceDistributionCard */
const COLORS = [
  '#2563EB', // blue
  '#3B82F6',
  '#38BDF8',
  '#14B8A6', // cyan
  '#6366F1',
  '#8B5CF6', // purple
  '#EC4899',
  '#F59E0B', // orange
]

/** Muted gray for overflow "其他" category */
const OVERFLOW_COLOR = '#94A3B8'

/** Max distinct categories before merging into "其他" */
const MAX_CATEGORIES = 8

/** SVG dimensions */
const SVG_SIZE = 190
const OUTER_RADIUS = 82
const INNER_RADIUS = 48
const CENTER = SVG_SIZE / 2

export function TopicDistributionCard({ sources, loading, onViewAll }: TopicDistributionCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (loading) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title="主题分布（Top 8）" onAction={onViewAll} />
        <div className="topic-distribution-content" style={contentLayoutStyle}>
          <div style={skeletonDonutStyle} />
          <div style={skeletonLegendContainerStyle}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={skeletonLegendItemStyle} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title="主题分布（Top 8）" onAction={onViewAll} />
        <p style={emptyStyle}>暂无主题数据，完成分类后将展示 Top 主题。</p>
      </div>
    )
  }

  const segments = buildSegments(sources)
  const arcs = buildArcs(segments)
  const total = sources.reduce((sum, s) => sum + s.count, 0)
  const hoveredArc = hoveredIndex === null ? null : arcs[hoveredIndex]
  const tooltipWidth = 126
  const tooltipX = hoveredArc
    ? clampTooltipX(hoveredArc.tooltipX, tooltipWidth, 6, SVG_SIZE - 6)
    : 0
  const tooltipY = hoveredArc
    ? Math.min(Math.max(hoveredArc.tooltipY - 30, 8), SVG_SIZE - 70)
    : 0

  return (
    <div className="tracking-panel" style={cardStyle}>
      <PanelHeader title="主题分布（Top 8）" onAction={onViewAll} />
      <div className="topic-distribution-content" style={contentLayoutStyle}>
        {/* Donut chart */}
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={svgStyle}
          role="img"
          aria-label="主题分布环形图"
        >
          {arcs.map((arc, index) => {
            const isActive = hoveredIndex === index
            return (
              <path
                key={arc.label}
                d={arc.path}
                fill={arc.color}
                stroke="#FFFFFF"
                strokeWidth={isActive ? 2.5 : 1.5}
                fillRule="evenodd"
                opacity={hoveredIndex === null || isActive ? 1 : 0.48}
                cursor="pointer"
                tabIndex={0}
                aria-label={`${arc.label} ${arc.count} 篇 ${arc.percent.toFixed(1)}%`}
                style={arcPathStyle}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              >
                <title>{`${arc.label}：${arc.count} 篇，占 ${arc.percent.toFixed(1)}%`}</title>
              </path>
            )
          })}
          {/* Center hole */}
          <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="#FFFFFF" />
          <text
            x={CENTER}
            y={hoveredArc ? CENTER - 12 : CENTER - 3}
            textAnchor="middle"
            fontSize={hoveredArc ? 11 : 20}
            fontWeight="800"
            fill="#0F172A"
          >
            {hoveredArc ? truncateLabel(hoveredArc.label) : total.toLocaleString('en-US')}
          </text>
          <text
            x={CENTER}
            y={hoveredArc ? CENTER + 6 : CENTER + 16}
            textAnchor="middle"
            fontSize={hoveredArc ? 16 : 11}
            fontWeight={hoveredArc ? 800 : 400}
            fill={hoveredArc ? hoveredArc.color : '#64748B'}
          >
            {hoveredArc ? `${hoveredArc.count} 篇` : '总计'}
          </text>
          {hoveredArc && (
            <text
              x={CENTER}
              y={CENTER + 23}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#64748B"
            >
              {hoveredArc.percent.toFixed(1)}%
            </text>
          )}
          {hoveredArc && (
            <SvgChartTooltip
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={58}
              anchorX={hoveredArc.tooltipX}
              accentColor={hoveredArc.color}
              eyebrow="主题占比"
              title={`${hoveredArc.count} 篇论文`}
              detail={`${hoveredArc.label} · ${hoveredArc.percent.toFixed(1)}%`}
            />
          )}
        </svg>

        {/* Legend */}
        <div style={legendContainerStyle}>
          {segments.map((seg, index) => {
            const isActive = hoveredIndex === index
            return (
              <div
                key={seg.label}
                style={{
                  ...legendItemStyle,
                  ...(isActive ? legendItemActiveStyle : null),
                }}
                tabIndex={0}
                aria-label={`${seg.label} ${seg.count} 篇 ${seg.percent.toFixed(1)}%`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              >
                <span style={{ ...legendDotStyle, background: seg.color }} />
                <span style={legendLabelStyle}>{seg.label}</span>
                <span style={legendCountStyle}>{seg.count}</span>
                <span style={legendValueStyle}>{seg.percent.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PanelHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={panelHeaderStyle}>
      <h3 style={titleStyle}>{title}</h3>
      <button type="button" style={panelActionStyle} onClick={onAction}>查看全部 →</button>
    </div>
  )
}

// ─── Data Helpers ───────────────────────────────────────────

type Segment = { label: string; count: number; percent: number; color: string }

function buildSegments(sources: SourceDistItem[]): Segment[] {
  const total = sources.reduce((sum, s) => sum + s.count, 0)
  if (total === 0) return []

  const sorted = [...sources].sort((a, b) => b.count - a.count)
  const topSources = sorted.slice(0, MAX_CATEGORIES)
  const overflowSources = sorted.slice(MAX_CATEGORIES)

  const segments: Segment[] = topSources.map((s, i) => ({
    label: s.source,
    count: s.count,
    percent: (s.count / total) * 100,
    color: COLORS[i],
  }))

  if (overflowSources.length > 0) {
    const overflowCount = overflowSources.reduce((sum, s) => sum + s.count, 0)
    segments.push({
      label: '其他',
      count: overflowCount,
      percent: (overflowCount / total) * 100,
      color: OVERFLOW_COLOR,
    })
  }

  return segments
}

type Arc = Segment & { path: string; tooltipX: number; tooltipY: number }

function buildArcs(segments: Segment[]): Arc[] {
  const arcs: Arc[] = []
  let startAngle = -Math.PI / 2 // Start from top

  for (const seg of segments) {
    const sweepAngle = (seg.percent / 100) * 2 * Math.PI

    // Handle full circle case (single segment = 100%)
    if (seg.percent >= 99.99) {
      // Draw two half-circles to avoid SVG arc rendering issues
      const path = [
        `M ${CENTER} ${CENTER - OUTER_RADIUS}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${CENTER} ${CENTER + OUTER_RADIUS}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 1 1 ${CENTER} ${CENTER - OUTER_RADIUS}`,
        `M ${CENTER} ${CENTER - INNER_RADIUS}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${CENTER} ${CENTER + INNER_RADIUS}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 1 0 ${CENTER} ${CENTER - INNER_RADIUS}`,
        `Z`,
      ].join(' ')

      arcs.push({
        ...seg,
        path,
        tooltipX: CENTER,
        tooltipY: CENTER - OUTER_RADIUS + 16,
      })
    } else {
      const endAngle = startAngle + sweepAngle
      const midAngle = startAngle + sweepAngle / 2
      const largeArcFlag = sweepAngle > Math.PI ? 1 : 0

      const x1 = CENTER + OUTER_RADIUS * Math.cos(startAngle)
      const y1 = CENTER + OUTER_RADIUS * Math.sin(startAngle)
      const x2 = CENTER + OUTER_RADIUS * Math.cos(endAngle)
      const y2 = CENTER + OUTER_RADIUS * Math.sin(endAngle)
      const innerX1 = CENTER + INNER_RADIUS * Math.cos(startAngle)
      const innerY1 = CENTER + INNER_RADIUS * Math.sin(startAngle)
      const innerX2 = CENTER + INNER_RADIUS * Math.cos(endAngle)
      const innerY2 = CENTER + INNER_RADIUS * Math.sin(endAngle)
      const tooltipRadius = (OUTER_RADIUS + INNER_RADIUS) / 2

      const path = [
        `M ${x1} ${y1}`,
        `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        `L ${innerX2} ${innerY2}`,
        `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1}`,
        `Z`,
      ].join(' ')

      arcs.push({
        ...seg,
        path,
        tooltipX: CENTER + tooltipRadius * Math.cos(midAngle),
        tooltipY: CENTER + tooltipRadius * Math.sin(midAngle),
      })
    }

    startAngle += sweepAngle
  }

  return arcs
}

function truncateLabel(label: string) {
  return label.length > 8 ? `${label.slice(0, 7)}...` : label
}

// ─── Styles ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-card)',
  padding: '18px 20px',
  minHeight: '252px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 800,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: 0,
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '8px',
}

const panelActionStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#4F46E5',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700,
  padding: 0,
  whiteSpace: 'nowrap',
}

const emptyStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--text-muted)',
  margin: 0,
  textAlign: 'center',
  padding: '24px 0',
}

const contentLayoutStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '18px',
  flex: '1 1 auto',
}

const svgStyle: React.CSSProperties = {
  flexShrink: 0,
  maxWidth: '46%',
  height: 'auto',
}

const arcPathStyle: React.CSSProperties = {
  outline: 'none',
  transition: 'opacity var(--transition-normal), stroke-width var(--transition-normal)',
}

const legendContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 1,
  minWidth: 0,
}

const legendItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  fontSize: '12px',
  lineHeight: 1.25,
  border: '1px solid transparent',
  borderRadius: '8px',
  cursor: 'pointer',
  margin: '0 -6px',
  minHeight: '24px',
  outline: 'none',
  padding: '4px 6px',
  transition:
    'background-color var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const legendItemActiveStyle: React.CSSProperties = {
  background: 'var(--bg-selected, #EFF6FF)',
  borderColor: 'var(--border-subtle, #E2E8F0)',
  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)',
}

const legendDotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
}

const legendLabelStyle: React.CSSProperties = {
  color: '#334155',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
}

const legendValueStyle: React.CSSProperties = {
  color: '#475569',
  fontWeight: 700,
  flexShrink: 0,
  minWidth: '46px',
  textAlign: 'right',
}

const legendCountStyle: React.CSSProperties = {
  color: '#0F172A',
  fontSize: '11px',
  fontWeight: 800,
  flexShrink: 0,
  minWidth: '22px',
  textAlign: 'right',
}

// Skeleton styles
const skeletonBase: React.CSSProperties = {
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}

const skeletonDonutStyle: React.CSSProperties = {
  ...skeletonBase,
  width: `${SVG_SIZE}px`,
  height: `${SVG_SIZE}px`,
  borderRadius: '50%',
  flexShrink: 0,
}

const skeletonLegendContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 1,
}

const skeletonLegendItemStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '80%',
  height: '16px',
  borderRadius: '4px',
}
