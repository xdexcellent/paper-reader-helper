export type SvgChartTooltipProps = {
  x: number
  y: number
  width?: number
  height?: number
  anchorX?: number
  accentColor: string
  eyebrow: string
  title: string
  detail?: string
}

export function clampTooltipX(anchorX: number, width: number, minX: number, maxX: number) {
  return Math.min(Math.max(anchorX - width / 2, minX), maxX - width)
}

export function SvgChartTooltip({
  x,
  y,
  width = 132,
  height = 58,
  anchorX,
  accentColor,
  eyebrow,
  title,
  detail,
}: SvgChartTooltipProps) {
  const pointerX =
    typeof anchorX === 'number'
      ? Math.min(Math.max(anchorX, x + 14), x + width - 14)
      : null
  const textX = x + 20

  return (
    <g pointerEvents="none">
      {pointerX !== null && (
        <path
          d={`M ${pointerX - 6} ${y + height - 1} L ${pointerX + 6} ${y + height - 1} L ${pointerX} ${y + height + 6} Z`}
          fill="var(--bg-panel, #FFFFFF)"
          stroke="var(--border-subtle, #E2E8F0)"
          strokeWidth="0.75"
        />
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="10"
        fill="var(--bg-panel, #FFFFFF)"
        stroke="var(--border-subtle, #E2E8F0)"
        strokeWidth="1"
        filter="drop-shadow(0 10px 22px rgba(15, 23, 42, 0.16))"
      />
      <rect
        x={x + 9}
        y={y + 11}
        width="4"
        height={height - 22}
        rx="2"
        fill={accentColor}
      />
      <circle cx={x + width - 16} cy={y + 15} r="3" fill={accentColor} opacity="0.85" />
      <text x={textX} y={y + 18} fontSize="9" fontWeight="700" fill="var(--text-muted, #64748B)">
        {eyebrow}
      </text>
      <text x={textX} y={y + 36} fontSize="13" fontWeight="800" fill="var(--text-primary, #0F172A)">
        {title}
      </text>
      {detail && (
        <text x={textX} y={y + 51} fontSize="9" fontWeight="600" fill="var(--text-muted, #64748B)">
          {detail}
        </text>
      )}
    </g>
  )
}
