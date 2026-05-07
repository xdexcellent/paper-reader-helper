import type { AgentAction, AgentScopeConfig } from '../../types'

export const RISK_LABELS: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  irreversible: '不可逆',
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  update_paper_metadata: '更新论文元数据',
  update_tags: '更新标签',
  update_category: '更新分类',
  create_category: '创建分类',
  assign_category: '分配分类',
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'low': return 'var(--color-success, #10b981)'
    case 'medium': return 'var(--color-warning, #f59e0b)'
    case 'high': return 'var(--color-danger, #ef4444)'
    case 'irreversible': return 'var(--color-danger, #ef4444)'
    default: return 'var(--color-muted, #888)'
  }
}

export function serializeScope(scope: AgentScopeConfig): string {
  switch (scope.scope_type) {
    case 'whole_library': return '全部论文库'
    case 'category': return `分类 #${scope.category_id ?? '?'}`
    case 'papers': return `${scope.paper_ids?.length ?? 0} 篇论文`
    case 'reader_paper': return '当前阅读论文'
    default: return scope.scope_type
  }
}

export function groupActionsByRisk(actions: AgentAction[]): Map<string, AgentAction[]> {
  const groups = new Map<string, AgentAction[]>()
  for (const a of actions) {
    const key = a.risk_level || 'low'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }
  return groups
}
