import type { Paper } from '../../types'
import { ClipboardList } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────
export type ActivityItem = {
  time: string
  eventType: string
  description: string
  status: 'completed' | 'processing' | 'failed'
}

export type RecentActivitiesTableProps = {
  papers: Paper[]
  loading?: boolean
  onViewAll?: () => void
}

// ─── Helpers ────────────────────────────────────────────────

/** Format a date string to "YYYY-MM-DD HH:mm" */
function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '--'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/** Truncate text to maxLen characters with ellipsis */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

/** Derive activity status and event type from paper.status */
function mapPaperStatus(status: string): { eventType: string; status: ActivityItem['status'] } {
  switch (status) {
    case 'ready':
      return { eventType: '完成', status: 'completed' }
    case 'parsing':
    case 'summarizing':
      return { eventType: '处理中', status: 'processing' }
    case 'failed':
      return { eventType: '失败', status: 'failed' }
    case 'queued':
      return { eventType: '排队', status: 'processing' }
    default:
      return { eventType: '导入', status: 'completed' }
  }
}

/** Derive activity records from papers array */
function deriveActivities(papers: Paper[]): ActivityItem[] {
  return papers
    .filter((p) => p.updated_at)
    .map((paper) => {
      const mapped = mapPaperStatus(paper.status)
      return {
        time: formatTime(paper.updated_at),
        eventType: mapped.eventType,
        description: truncate(paper.title, 80),
        status: mapped.status,
      }
    })
    .sort((a, b) => (b.time > a.time ? 1 : b.time < a.time ? -1 : 0))
    .slice(0, 20)
}

// ─── Status Badge Colors ────────────────────────────────────
const statusColors: Record<ActivityItem['status'], { bg: string; color: string; border: string; label: string }> = {
  completed: {
    bg: 'rgba(16, 185, 129, 0.12)',
    color: '#10B981',
    border: 'rgba(16, 185, 129, 0.3)',
    label: '完成',
  },
  processing: {
    bg: 'rgba(37, 99, 235, 0.12)',
    color: '#2563EB',
    border: 'rgba(37, 99, 235, 0.3)',
    label: '进行中',
  },
  failed: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#EF4444',
    border: 'rgba(239, 68, 68, 0.3)',
    label: '失败',
  },
}

// ─── Component ──────────────────────────────────────────────
export function RecentActivitiesTable({ papers, loading, onViewAll }: RecentActivitiesTableProps) {
  if (loading) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title="近期处理动态" onAction={onViewAll} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={skeletonRowStyle}>
              <div style={{ ...skeletonBlock, width: '120px' }} />
              <div style={{ ...skeletonBlock, width: '60px' }} />
              <div style={{ ...skeletonBlock, width: '200px' }} />
              <div style={{ ...skeletonBlock, width: '50px' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const activities = deriveActivities(papers)

  if (activities.length === 0) {
    return (
      <div className="tracking-panel" style={cardStyle}>
        <PanelHeader title="近期处理动态" onAction={onViewAll} />
        <div style={emptyStyle}>
          <span style={emptyIconStyle}><ClipboardList size={22} /></span>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
            暂无处理记录
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="tracking-panel" style={cardStyle}>
      <PanelHeader title="近期处理动态" onAction={onViewAll} />
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>时间</th>
              <th style={thStyle}>事件类型</th>
              <th style={thStyle}>详情</th>
              <th style={thStyle}>状态</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity, idx) => (
              <tr key={idx} style={trStyle}>
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {activity.time}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {activity.eventType}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                    {activity.description}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={badgeStyle(activity.status)}>
                    {statusColors[activity.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PanelHeader({ title, onAction }: { title: string; onAction?: () => void }) {
  return (
    <div style={panelHeaderStyle}>
      <h3 style={titleStyle}>{title}</h3>
      <button type="button" style={panelActionStyle} onClick={onAction}>查看全部动态 →</button>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-card)',
  padding: '20px 22px',
  transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: 800,
  color: 'var(--text-primary)',
  margin: 0,
  lineHeight: 1.4,
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
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

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '11px 14px',
  background: '#F8FAFC',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
}

const trStyle: React.CSSProperties = {
  transition: 'background var(--transition-fast)',
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '36px 24px',
}

const emptyIconStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  background: '#F8FAFC',
  color: '#94A3B8',
  border: '1px solid var(--border-subtle)',
}

const skeletonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'center',
  padding: '8px 0',
}

const skeletonBlock: React.CSSProperties = {
  height: '16px',
  borderRadius: '4px',
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
}

function badgeStyle(status: ActivityItem['status']): React.CSSProperties {
  const config = statusColors[status]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    background: config.bg,
    color: config.color,
    border: `1px solid ${config.border}`,
    whiteSpace: 'nowrap',
  }
}
