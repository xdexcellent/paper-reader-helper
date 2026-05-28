import type { ReactNode } from 'react'

export type TrackingKpiCardProps = {
  label: string
  value: number | string
  note: string
  icon: ReactNode
  iconColor: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

/**
 * Format a KPI value for display:
 * - Numbers: thousands separator (e.g. 1,234)
 * - Percentage strings (ending with '%'): 1 decimal place (e.g. "85.3%")
 * - Other strings: pass through as-is
 */
function formatValue(value: number | string): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  // Percentage string like "85.3%" or "85%"
  if (typeof value === 'string' && value.endsWith('%')) {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      return num.toFixed(1) + '%'
    }
  }
  return value
}

export function TrackingKpiCard({
  label,
  value,
  note,
  icon,
  iconColor,
  loading,
  error,
  onRetry,
}: TrackingKpiCardProps) {
  return (
    <div className="tracking-kpi-card" style={cardStyle}>
      {/* Icon container */}
      <div
        className="tracking-kpi-icon"
        style={{
          ...iconContainerStyle,
          background: `linear-gradient(135deg, ${iconColor}22, ${iconColor}11)`,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading ? (
          <div className="tracking-kpi-skeleton" style={skeletonContainerStyle}>
            <div style={skeletonValueStyle} />
            <div style={skeletonLabelStyle} />
            <div style={skeletonNoteStyle} />
          </div>
        ) : error ? (
          <div style={errorContainerStyle}>
            <span style={errorValueStyle}>--</span>
            <span style={labelStyle}>{label}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                style={retryButtonStyle}
                aria-label={`重试加载${label}`}
              >
                重试
              </button>
            )}
          </div>
        ) : (
          <>
            <span style={valueStyle}>{formatValue(value)}</span>
            <span style={labelStyle}>{label}</span>
            <span style={noteStyle}>{note}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  minHeight: '92px',
  padding: '16px 18px',
  background: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-card)',
  transition: 'transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal)',
  cursor: 'default',
}

const iconContainerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const contentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  order: -1,
}

const valueStyle: React.CSSProperties = {
  fontSize: '25px',
  fontWeight: 800,
  lineHeight: 1.2,
  color: 'var(--text-primary)',
  letterSpacing: 0,
}

const errorValueStyle: React.CSSProperties = {
  ...valueStyle,
  color: 'var(--text-weak)',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  lineHeight: 1.4,
  color: 'var(--text-secondary)',
}

const noteStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

const errorContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

const retryButtonStyle: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--accent-blue)',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
  width: 'fit-content',
}

// Skeleton styles
const skeletonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const skeletonBase: React.CSSProperties = {
  borderRadius: '4px',
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'tracking-kpi-shimmer 1.5s ease-in-out infinite',
}

const skeletonValueStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '64px',
  height: '24px',
}

const skeletonLabelStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '80px',
  height: '14px',
}

const skeletonNoteStyle: React.CSSProperties = {
  ...skeletonBase,
  width: '56px',
  height: '12px',
}
