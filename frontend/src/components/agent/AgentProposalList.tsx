import { useState } from 'react'
import type { AgentAction } from '../../types'
import { ACTION_TYPE_LABELS, RISK_LABELS, groupActionsByRisk, isBatchApprovableRisk } from './agentUtils'

interface Props {
  actions: AgentAction[]
  onApprove: (id: number) => void
  onReject: (id: number, reason: string) => void
  onRevert: (id: number) => void
  onBatchApprove: (ids: number[]) => void
  loading: boolean
}

function formatProposalValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getChangeEntries(action: AgentAction): Array<[string, string]> {
  const afterValues = action.after_values ?? {}
  return Object.entries(afterValues).map(([key, value]) => [key, formatProposalValue(value)])
}

export function AgentProposalList({ actions, onApprove, onReject, onRevert, onBatchApprove, loading }: Props) {
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({})

  if (actions.length === 0) return null

  const groups = groupActionsByRisk(actions)
  const riskOrder = ['irreversible', 'high', 'medium', 'low']
  const proposedActions = actions.filter((a) => a.status === 'proposed')
  const batchApprovableActions = proposedActions.filter((a) => isBatchApprovableRisk(a.risk_level))
  const riskGroupOrder = riskOrder.filter((r) => groups.has(r))

  return (
    <div className="agent-proposal-list" role="region" aria-label="Agent 操作建议列表">
      <h3 className="agent-proposal-title">操作建议 ({proposedActions.length} 待批准)</h3>
      {riskGroupOrder.map((risk) => {
        const groupActions = groups.get(risk)!
        return (
          <div key={risk} className={`agent-proposal-group agent-proposal-group--${risk}`}>
            <div className="agent-proposal-group-header">
              <span className="agent-risk-dot" aria-hidden="true" />
              <span className="agent-proposal-group-label">
                {RISK_LABELS[risk] || risk} ({groupActions.length})
              </span>
            </div>
            {groupActions.map((action) => {
              const changeEntries = getChangeEntries(action)
              return (
                <div key={action.id} className={`agent-proposal-card agent-proposal-card--${action.risk_level}`}>
                  <div className="agent-proposal-card-header">
                    <strong className="agent-proposal-action-type">
                      {ACTION_TYPE_LABELS[action.action_type] || action.action_type}
                    </strong>
                    <span className={`agent-risk-badge agent-risk-badge--${action.risk_level}`}>
                      {RISK_LABELS[action.risk_level] || action.risk_level}
                    </span>
                    <span className={`agent-status-badge agent-status-badge--${action.status}`}>
                      {action.status}
                    </span>
                  </div>
                  <div className="agent-proposal-card-body">
                    {action.rationale && <p className="agent-proposal-rationale">{action.rationale}</p>}
                    {action.action_type === 'create_category' && (
                      <p className="agent-proposal-impact" role="note">
                        将新增自定义分类，需逐条确认；批准后会改变分类体系。
                      </p>
                    )}
                    <dl className="agent-proposal-meta">
                      <dt>置信度</dt>
                      <dd>{Math.round(action.confidence * 100)}%</dd>
                      {action.target_paper_id != null && (
                        <>
                          <dt>论文 ID</dt>
                          <dd>{action.target_paper_id}</dd>
                        </>
                      )}
                      {action.target_category_id != null && (
                        <>
                          <dt>分类 ID</dt>
                          <dd>{action.target_category_id}</dd>
                        </>
                      )}
                      {changeEntries.flatMap(([key, value]) => [
                        <dt key={`dt-${key}`}>{key}</dt>,
                        <dd key={`dd-${key}`} title={value}>{value}</dd>,
                      ])}
                    </dl>
                  </div>
                  <div className="agent-proposal-card-actions">
                    {action.status === 'proposed' && (
                      <>
                        <button
                          type="button"
                          className="agent-action-btn agent-action-btn--approve"
                          disabled={loading}
                          onClick={() => onApprove(action.id)}
                          aria-label={`批准操作 ${action.id}`}
                        >
                          批准
                        </button>
                        <input
                          type="text"
                          className="agent-reject-input"
                          placeholder="拒绝原因（可选）"
                          value={rejectReasons[action.id] || ''}
                          onChange={(e) =>
                            setRejectReasons((prev) => ({ ...prev, [action.id]: e.target.value }))
                          }
                          aria-label={`拒绝操作 ${action.id} 的原因`}
                        />
                        <button
                          type="button"
                          className="agent-action-btn agent-action-btn--reject"
                          disabled={loading}
                          onClick={() => {
                            onReject(action.id, rejectReasons[action.id] || '')
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
                        className="agent-action-btn agent-action-btn--revert"
                        disabled={loading}
                        onClick={() => onRevert(action.id)}
                        aria-label={`撤销操作 ${action.id}`}
                      >
                        撤销
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      {batchApprovableActions.length > 0 && (
        <div className="agent-batch-actions">
          <button
            type="button"
            className="agent-batch-btn"
            disabled={loading}
            onClick={() => onBatchApprove(batchApprovableActions.map((a) => a.id))}
            aria-label={`批量批准 ${batchApprovableActions.length} 个低风险操作`}
          >
            批量批准低风险 ({batchApprovableActions.length})
          </button>
        </div>
      )}
    </div>
  )
}
