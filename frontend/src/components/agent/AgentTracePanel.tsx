import type { AgentToolEvent } from '../../types'

interface Props {
  events: AgentToolEvent[]
}

export function AgentTracePanel({ events }: Props) {
  if (events.length === 0) return null

  return (
    <div className="agent-trace-panel" role="region" aria-label="Agent 工具调用追踪">
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        工具调用追踪 ({events.length})
      </h3>
      {events.map((event) => (
        <details key={event.id} className="agent-trace-item">
          <summary>
            <span
              className="badge"
              style={{
                background: event.status === 'error' ? '#ef4444' : '#10b981',
                color: '#fff',
                fontSize: '0.75rem',
                padding: '0.15rem 0.4rem',
                borderRadius: 3,
                marginRight: '0.5rem',
              }}
            >
              {event.status === 'error' ? '失败' : '成功'}
            </span>
            <strong>{event.tool_name}</strong>
          </summary>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
            <p style={{ margin: '0.25rem 0', color: 'var(--color-muted, #888)' }}>
              输入: {event.input_summary || '—'}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              输出: {event.output_summary || '—'}
            </p>
            {event.status === 'error' && event.error_message && (
              <p style={{ margin: '0.25rem 0', color: '#ef4444' }}>
                错误: {event.error_message}
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
