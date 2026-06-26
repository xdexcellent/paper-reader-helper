import { useState } from 'react'
import type { DailyStatsItem } from '../../lib/api'
import { clampTooltipX, SvgChartTooltip } from './ChartTooltip'

export type ImportTrendChartProps = {
  data: DailyStatsItem[]
  loading?: boolean
  rangeDays?: number
  onViewDetails?: () => void
}

/**
 * 导入趋势图表 — 纯 SVG 柱状图 + 折线图组合展示最近 7 天导入数量趋势
 */
export function ImportTrendChart({ data, loading, rangeDays = 7, onViewDetails }: ImportTrendChartProps) {
  const isEmpty = data.length === 0
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Chart dimensions
  const chartWidth = 420
  const chartHeight = 178
  const paddingTop = 14
  const paddingBottom = 30
  const paddingLeft = 38
  const paddingRight = 14
  const plotWidth = chartWidth - paddingLeft - paddingRight
  const plotHeight = chartHeight - paddingTop - paddingBottom
  const lineBandHeight = 58
  const lineBandGap = 10
  const barTop = paddingTop + lineBandHeight + lineBandGap
  const barPlotHeight = plotHeight - lineBandHeight - lineBandGap

  // Y-axis auto-scale
  const maxValue = isEmpty ? 10 : Math.max(...data.map((d) => d.count), 1)
  const yTicks = computeYTicks(maxValue)
  const yMax = yTicks[yTicks.length - 1] || maxValue

  // Bar and point calculations
  const barCount = data.length || 7
  const barGap = 4
  const barWidth = Math.max(
    8,
    (plotWidth - barGap * (barCount - 1)) / barCount
  )

  // Compute bar positions and polyline points
  const bars = data.map((item, i) => {
    const x = paddingLeft + i * (barWidth + barGap) + barWidth / 2
    const barHeight = yMax > 0 ? (item.count / yMax) * barPlotHeight : 0
    const barY = barTop + barPlotHeight - barHeight
    const lineY = paddingTop + lineBandHeight - (item.count / yMax) * (lineBandHeight - 10)
    return { x, barY, barHeight, lineY, count: item.count, date: item.date }
  })

  const polylinePoints = bars
    .map((b) => `${b.x},${b.lineY}`)
    .join(' ')
  const hoveredBar = hoveredIndex === null ? null : bars[hoveredIndex]
  const tooltipWidth = 136
  const tooltipX = hoveredBar
    ? clampTooltipX(hoveredBar.x, tooltipWidth, paddingLeft, chartWidth - paddingRight)
    : 0

  return (
    <div className="tracking-panel" style={cardStyle}>
      <PanelHeader title={`近${rangeDays}日导入趋势`} onAction={onViewDetails} />

      {loading ? (
        <div style={skeletonContainerStyle}>
          <div style={skeletonChartStyle} />
        </div>
      ) : isEmpty ? (
        <div style={emptyStyle}>暂无导入数据，开始导入论文后将展示趋势图表。</div>
      ) : (
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={svgStyle}
          aria-label="导入趋势图表"
          role="img"
        >
          {/* Y-axis grid lines and labels */}
          {yTicks.map((tick) => {
            const y = barTop + barPlotHeight - (tick / yMax) * barPlotHeight
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                />
                <text
                  x={paddingLeft - 4}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="8"
                  fill="#94A3B8"
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {bars.map((bar, i) => (
            <rect
              key={i}
              className="chart-bar"
              x={bar.x - barWidth / 2}
              y={bar.barY}
              width={barWidth}
              height={Math.max(bar.barHeight, 0)}
              rx={2}
              fill={hoveredIndex === i ? '#2563EB' : 'rgba(37, 99, 235, 0.25)'}
              opacity={hoveredIndex === i ? 0.64 : 1}
              stroke={hoveredIndex === i ? '#1D4ED8' : 'transparent'}
              strokeWidth={hoveredIndex === i ? 1 : 0}
              style={{ animationDelay: `${i * 0.04}s` }}
            />
          ))}

          {/* Trend polyline */}
          {bars.length > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="#2563EB"
              strokeWidth="1.5"
              strokeDasharray="8 8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points on polyline */}
          {bars.map((bar, i) => (
            <circle
              key={i}
              cx={bar.x}
              cy={bar.lineY}
              r={hoveredIndex === i ? 4 : 2.5}
              fill="#FFFFFF"
              stroke="#2563EB"
              strokeWidth={hoveredIndex === i ? 2 : 1.5}
            />
          ))}

          {/* Hover hit areas */}
          {bars.map((bar, i) => (
            <rect
              key={`hit-${bar.date}`}
              x={bar.x - Math.max(barWidth / 2, 14)}
              y={paddingTop}
              width={Math.max(barWidth, 28)}
              height={chartHeight - paddingTop - 2}
              fill="transparent"
              cursor="crosshair"
              tabIndex={0}
              aria-label={`${bar.date} 导入 ${bar.count} 篇`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(i)}
              onBlur={() => setHoveredIndex(null)}
            >
              <title>{`${bar.date}：导入 ${bar.count} 篇`}</title>
            </rect>
          ))}

          {/* X-axis date labels */}
          {bars.map((bar, i) => (
            <text
              key={i}
              x={bar.x}
              y={chartHeight - 4}
              textAnchor="middle"
              fontSize="7"
              fill="#94A3B8"
            >
              {formatDateLabel(bar.date)}
            </text>
          ))}

          {hoveredBar && (
            <g pointerEvents="none">
              <line
                x1={hoveredBar.x}
                y1={paddingTop}
                x2={hoveredBar.x}
                y2={chartHeight - paddingBottom + 2}
                stroke="#2563EB"
                strokeWidth="0.75"
                strokeDasharray="3 3"
                opacity="0.55"
              />
              <SvgChartTooltip
                x={tooltipX}
                y={paddingTop - 6}
                width={tooltipWidth}
                height={58}
                anchorX={hoveredBar.x}
                accentColor="#2563EB"
                eyebrow={`${formatDateLabel(hoveredBar.date)} · 导入`}
                title={`${hoveredBar.count} 篇论文`}
                detail={hoveredBar.date}
              />
            </g>
          )}
        </svg>
      )}
    </div>
  )
}

function PanelHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={panelHeaderStyle}>
      <div>
        <h3 style={titleStyle}>{title}</h3>
        <p style={subtitleStyle}>导入文章数与 7 日趋势线</p>
      </div>
      <button type="button" style={panelActionStyle} onClick={onAction}>查看详情 →</button>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

/** Format "YYYY-MM-DD" to "MM-DD" */
function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length >= 3) {
    return `${parts[1]}-${parts[2]}`
  }
  return dateStr
}

/** Compute nice Y-axis tick values */
function computeYTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0]
  const tickCount = 4
  const rawStep = maxValue / tickCount
  // Round step to a nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  let niceStep: number
  if (residual <= 1.5) niceStep = 1 * magnitude
  else if (residual <= 3) niceStep = 2 * magnitude
  else if (residual <= 7) niceStep = 5 * magnitude
  else niceStep = 10 * magnitude

  // Ensure step is at least 1
  niceStep = Math.max(1, niceStep)

  const ticks: number[] = []
  for (let v = 0; v <= maxValue + niceStep * 0.5; v += niceStep) {
    ticks.push(Math.round(v))
    if (ticks.length > tickCount + 1) break
  }
  // Ensure we have at least the max value covered
  if (ticks[ticks.length - 1] < maxValue) {
    ticks.push(ticks[ticks.length - 1] + niceStep)
  }
  return ticks
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
  transition:
    'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 800,
  lineHeight: 1.4,
  color: 'var(--text-primary)',
  margin: 0,
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
  marginBottom: '14px',
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

const emptyStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--text-muted)',
  padding: '16px 0',
}

// Skeleton styles
const skeletonContainerStyle: React.CSSProperties = {
  padding: '4px 0',
}

const skeletonChartStyle: React.CSSProperties = {
  width: '100%',
  height: '170px',
  borderRadius: '6px',
  background:
    'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}
