import { useState } from 'react'
import type { AgentAction } from '../../types'
import { ACTION_TYPE_LABELS, RISK_LABELS, getRiskColor, groupActionsByRisk } from './agentUtils'

interface Props {
  actions: AgentAction[]
  onApprove: (id: number) => void
  onReject: (id: number) => void
  onRevert: (id: number) => void
  onBatchApprove: (ids: number[]) => void
  loading: boolean
}

export function AgentProposalList({ actions, onApprove, onReject, onRevert, onBatchApprove, loading }: Props) {
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({})

  if (actions.length === 0) return null

  const groups = groupActionsByRisk(actions)
  const riskOrder = ['irreversible', 'high', 'medium', 'low']
  const proposedActions = actions.filter((a) => a.status === 'proposed')
  const riskGroupOrder = riskOrder.filter((r) => groups.has(r))

  return (
    <div role="region" aria-label="Agent 操作建议列表">
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        操作建议 ({proposedActions.length} 待批准)
      </h3>
      {riskGroupOrder.map((risk) => {
        const groupActions = groups.get(risk)!
        return (
          <div key={risk} className="agent-proposal-group">
            <div className="agent-proposal-group-header" style={{ color: getRiskColor(risk) }}>
              {RISK_LABELS[risk] || risk} ({groupActions.length})
            </div>
            {groupActions.map((action) => (
              <div key={action.id} className="agent-proposal-card">
                <div className="agent-proposal-card-header">
                  <div>
                    <strong>{ACTION_TYPE_LABELS[action.action_type] || action.action_type}</strong>
                    <span
                      className="badge"
                      style={{
                        background: getRiskColor(action.risk_level),
                        color: action.risk_level === 'low' ? '#fff' : '#000',
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.3rem',
                        borderRadius: 3,
                        marginLeft: '0.5rem',
                      }}
                    >
                      {RISK_LABELS[action.risk_level] || action.risk_level}
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: 'var(--color-muted, #888)',
                        color: '#fff',
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.3rem',
                        borderRadius: 3,
                        marginLeft: '0.5rem',
                      }}
                    >
                      {action.status}
                    </span>
                  </div>
                </div>
                <div className="agent-proposal-card-body">
                  {action.rationale && <p style={{ margin: '0.25rem 0' }}>{action.rationale}</p>}
                  <dl>
                    <dt>置信度</dt>
                    <dd>{Math.round(action.confidence * 100)}%</dd>
                    {action.target_paper_id && <><dt>论文 ID</dt><dd>{action.target_paper_id}</dd></>}
                    {action.target_category_id && <><dt>分类 ID</dt><dd>{action.target_category_id}</dd></>}
                  </dl>
                </div>
                <div className="agent-proposal-card-actions">
                  {action.status === 'proposed' && (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onApprove(action.id)}
                        aria-label={`批准操作 ${action.id}`}
                      >
                        批准
                      </button>
                      <input
                        type="text"
                        placeholder="拒绝原因（可选）"
                        value={rejectReasons[action.id] || ''}
                        onChange={(e) =>
                          setRejectReasons((prev) => ({ ...prev, [action.id]: e.target.value }))
                        }
                        style={{ flex: 1, padding: '0.25rem' }}
                        aria-label={`拒绝操作 ${action.id} 的原因`}
                      />
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          onReject(action.id)
                          setRejectReasons((prev) => {
                            const next = { ...prev }
                            delete next[action.id]
                            return next
                          })
                        }}
                        aria-label={`拒绝操作 ${action.id}`}
                      >
                        拒绝
                      </button>
                    </>
                  )}
                  {action.status === 'executed' && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onRevert(action.id)}
                      aria-label={`撤销操作 ${action.id}`}
                    >
                      撤销
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
      {proposedActions.length > 0 && (
        <div className="agent-batch-actions">
          <button
            type="button"
            disabled={loading}
            onClick={() => onBatchApprove(proposedActions.map((a) => a.id))}
            aria-label={`批量批准 ${proposedActions.length} 个操作`}
          >
            批量批准 ({proposedActions.length})
          </button>
        </div>
      )}
    </div>
  )
}
