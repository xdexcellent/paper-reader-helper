import type { AgentScopeConfig } from '../../types'

interface Props {
  scope: AgentScopeConfig
  onChange: (scope: AgentScopeConfig) => void
}

const SCOPE_OPTIONS: { value: AgentScopeConfig['scope_type']; label: string }[] = [
  { value: 'whole_library', label: '全部论文库' },
  { value: 'category', label: '特定分类' },
  { value: 'papers', label: '指定论文' },
  { value: 'reader_paper', label: '当前阅读论文' },
]

export function AgentScopePicker({ scope, onChange }: Props) {
  return (
    <div className="agent-scope-picker">
      <label htmlFor="agent-scope-type" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
        操作范围
      </label>
      <select
        id="agent-scope-type"
        value={scope.scope_type}
        onChange={(e) => {
          const scopeType = e.target.value as AgentScopeConfig['scope_type']
          onChange({ ...scope, scope_type: scopeType })
        }}
        aria-label="选择 Agent 操作范围"
      >
        {SCOPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {scope.scope_type === 'category' && (
        <input
          type="number"
          value={scope.category_id ?? ''}
          onChange={(e) =>
            onChange({
              ...scope,
              category_id: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="分类 ID"
          aria-label="分类 ID"
          style={{ width: 80, padding: '0.25rem 0.5rem' }}
        />
      )}
    </div>
  )
}
