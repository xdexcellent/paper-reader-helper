import { useState } from 'react'
import type { DailyStatsItem } from '../../lib/api'
import { clampTooltipX, SvgChartTooltip } from './ChartTooltip'

export type CompletionTrendChartProps = {
  data: DailyStatsItem[]
  loading?: boolean
  rangeDays?: number
  onViewDetails?: () => void
}

/**
 * Format a "YYYY-MM-DD" date string to "MM-DD" for brevity on X-axis labels.
 */
function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length >= 3) {
    return `${parts[1]}-${parts[2]}`
  }
  return dateStr
}

export function CompletionTrendChart({ data, loading, rangeDays = 7, onViewDetails }: CompletionTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (loading) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title={`近${rangeDays}日完成趋势`} onAction={onViewDetails} />
        <div style={skeletonContainerStyle}>
          <div style={skeletonChartStyle} />
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title={`近${rangeDays}日完成趋势`} onAction={onViewDetails} />
        <div style={emptyStateStyle}>
          <span style={emptyTextStyle}>暂无完成趋势数据，处理完成后将自动生成曲线。</span>
        </div>
      </div>
    )
  }

  // Chart dimensions
  const svgWidth = 420
  const svgHeight = 178
  const paddingTop = 14
  const paddingBottom = 30
  const paddingLeft = 38
  const paddingRight = 14
  const chartWidth = svgWidth - paddingLeft - paddingRight
  const chartHeight = svgHeight - paddingTop - paddingBottom
  const lineBandHeight = 58
  const lineBandGap = 10
  const barTop = paddingTop + lineBandHeight + lineBandGap
  const barChartHeight = chartHeight - lineBandHeight - lineBandGap

  // Y-axis auto-scale
  const maxValue = Math.max(...data.map(d => d.count), 1)
  const yScale = barChartHeight / maxValue

  // Bar width and spacing
  const barCount = data.length
  const barGap = 4
  const barWidth = Math.max(
    8,
    (chartWidth - barGap * (barCount - 1)) / barCount
  )

  // Generate Y-axis ticks (up to 4 ticks)
  const tickCount = Math.min(4, maxValue)
  const yTicks: number[] = []
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(Math.round((maxValue / tickCount) * i))
  }

  // Build polyline points
  const polylinePoints = data
    .map((d, i) => {
      const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2
      const y = paddingTop + lineBandHeight - (d.count / maxValue) * (lineBandHeight - 10)
      return `${x},${y}`
    })
    .join(' ')
  const hoveredItem = hoveredIndex === null ? null : data[hoveredIndex]
  const hoveredX =
    hoveredIndex === null ? 0 : paddingLeft + hoveredIndex * (barWidth + barGap) + barWidth / 2
  const tooltipWidth = 136
  const tooltipX = hoveredItem
    ? clampTooltipX(hoveredX, tooltipWidth, paddingLeft, svgWidth - paddingRight)
    : 0

  return (
    <div className="tracking-panel" style={cardStyle}>
      <PanelHeader title={`近${rangeDays}日完成趋势`} onAction={onViewDetails} />
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={svgStyle}
        role="img"
        aria-label="完成趋势图表"
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => {
          const y = barTop + barChartHeight - tick * yScale
          return (
            <g key={`y-${tick}`}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={svgWidth - paddingRight}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth={0.5}
                strokeDasharray="2,2"
              />
              <text
                x={paddingLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="#94A3B8"
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = paddingLeft + i * (barWidth + barGap)
          const barHeight = d.count * yScale
          const y = barTop + barChartHeight - barHeight
          return (
            <rect
              key={`bar-${i}`}
              className="chart-bar"
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={hoveredIndex === i ? '#10B981' : 'rgba(16, 185, 129, 0.35)'}
              opacity={hoveredIndex === i ? 0.68 : 1}
              stroke={hoveredIndex === i ? '#059669' : 'transparent'}
              strokeWidth={hoveredIndex === i ? 1 : 0}
              style={{ animationDelay: `${i * 0.04}s` }}
            />
          )
        })}

        {/* Polyline overlay */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#10B981"
          strokeWidth={2}
          strokeDasharray="8 8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points on polyline */}
        {data.map((d, i) => {
          const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2
          const y = paddingTop + lineBandHeight - (d.count / maxValue) * (lineBandHeight - 10)
          return (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={hoveredIndex === i ? 4.5 : 3}
              fill="#FFFFFF"
              stroke="#10B981"
              strokeWidth={hoveredIndex === i ? 2 : 1.5}
            />
          )
        })}

        {/* Hover hit areas */}
        {data.map((d, i) => {
          const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2
          return (
            <rect
              key={`hit-${d.date}`}
              x={x - Math.max(barWidth / 2, 14)}
              y={paddingTop}
              width={Math.max(barWidth, 28)}
              height={svgHeight - paddingTop - 2}
              fill="transparent"
              cursor="crosshair"
              tabIndex={0}
              aria-label={`${d.date} 完成 ${d.count} 篇`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(i)}
              onBlur={() => setHoveredIndex(null)}
            >
              <title>{`${d.date}：完成 ${d.count} 篇`}</title>
            </rect>
          )
        })}

        {/* X-axis date labels */}
        {data.map((d, i) => {
          const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2
          return (
            <text
              key={`label-${i}`}
              x={x}
              y={svgHeight - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#94A3B8"
            >
            {formatDateLabel(d.date)}
          </text>
          )
        })}

        {hoveredItem && (
          <g pointerEvents="none">
            <line
              x1={hoveredX}
              y1={paddingTop}
              x2={hoveredX}
              y2={svgHeight - paddingBottom + 2}
              stroke="#10B981"
              strokeWidth="0.75"
              strokeDasharray="3 3"
              opacity="0.55"
            />
            <SvgChartTooltip
              x={tooltipX}
              y={paddingTop - 6}
              width={tooltipWidth}
              height={58}
              anchorX={hoveredX}
              accentColor="#10B981"
              eyebrow={`${formatDateLabel(hoveredItem.date)} · 完成`}
              title={`${hoveredItem.count} 篇论文`}
              detail={hoveredItem.date}
            />
          </g>
        )}
      </svg>
    </div>
  )
}

function PanelHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={panelHeaderStyle}>
      <div>
        <h3 style={titleStyle}>{title}</h3>
        <p style={subtitleStyle}>完成文章数与完成率波动</p>
      </div>
      <button type="button" style={panelActionStyle} onClick={onAction}>查看详情 →</button>
    </div>
  )
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
  gap: '12px',
  transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 800,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
}

const subtitleStyle: React.CSSProperties = {
  margin: '2px 0 0',
  fontSize: '12px',
  color: 'var(--text-muted)',
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '2px',
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

const svgStyle: React.CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  flex: '1 1 auto',
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '120px',
}

const emptyTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--text-muted)',
}

const skeletonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const skeletonChartStyle: React.CSSProperties = {
  width: '100%',
  height: '170px',
  borderRadius: '8px',
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}
