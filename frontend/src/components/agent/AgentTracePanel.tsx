import type { AgentToolEvent } from '../../types'

interface Props {
  events: AgentToolEvent[]
}

type TraceTone = 'success' | 'warning' | 'error'

function getTone(status: string): TraceTone {
  if (status === 'error') return 'error'
  if (status === 'warning') return 'warning'
  return 'success'
}

function badgeLabel(status: string): string {
  if (status === 'error') return '失败'
  if (status === 'warning') return '警告'
  return '成功'
}

export function AgentTracePanel({ events }: Props) {
  if (events.length === 0) return null

  return (
    <div className="agent-trace-panel" role="region" aria-label="Agent 工具调用追踪">
      <h3 className="agent-trace-title">工具调用追踪 ({events.length})</h3>
      {events.map((event) => {
        const tone = getTone(event.status)
        return (
          <details key={event.id} className={`agent-trace-item agent-trace-item--${tone}`}>
            <summary>
              <span className={`agent-trace-badge agent-trace-badge--${tone}`}>
                {badgeLabel(event.status)}
              </span>
              <strong>{event.tool_name}</strong>
            </summary>
            <div className="agent-trace-body">
              <p className="agent-trace-line agent-trace-line--muted">
                输入: {event.input_summary || '—'}
              </p>
              <p className="agent-trace-line">
                输出: {event.output_summary || '—'}
              </p>
              {(event.status === 'error' || event.status === 'warning') && event.error_message && (
                <p className={`agent-trace-line agent-trace-line--${tone}`}>
                  错误: {event.error_message}
                </p>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
