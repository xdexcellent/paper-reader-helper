import { describe, expect, test } from 'vitest'
import { serializeScope, groupActionsByRisk } from './agentUtils'
import type { AgentAction, AgentScopeConfig } from '../../types'

describe('serializeScope', () => {
  test('whole_library returns correct label', () => {
    const scope: AgentScopeConfig = { scope_type: 'whole_library' }
    expect(serializeScope(scope)).toBe('全部论文库')
  })

  test('category returns label with category_id', () => {
    const scope: AgentScopeConfig = { scope_type: 'category', category_id: 3 }
    expect(serializeScope(scope)).toBe('分类 #3')
  })

  test('category without category_id shows placeholder', () => {
    const scope: AgentScopeConfig = { scope_type: 'category' }
    expect(serializeScope(scope)).toBe('分类 #?')
  })

  test('papers returns count', () => {
    const scope: AgentScopeConfig = { scope_type: 'papers', paper_ids: [1, 2, 3] }
    expect(serializeScope(scope)).toBe('3 篇论文')
  })

  test('reader_paper returns label', () => {
    const scope: AgentScopeConfig = { scope_type: 'reader_paper' }
    expect(serializeScope(scope)).toBe('当前阅读论文')
  })
})

describe('groupActionsByRisk', () => {
  function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
    return {
      id: 1,
      agent_run_id: 1,
      action_type: 'update_tags',
      before_values: {},
      after_values: {},
      rationale: '',
      confidence: 0.9,
      risk_level: 'low',
      status: 'proposed',
      rejection_reason: '',
      error_message: '',
      ...overrides,
    }
  }

  test('groups actions by risk level', () => {
    const actions = [
      makeAction({ id: 1, risk_level: 'low' }),
      makeAction({ id: 2, risk_level: 'high' }),
      makeAction({ id: 3, risk_level: 'low' }),
      makeAction({ id: 4, risk_level: 'medium' }),
    ]
    const groups = groupActionsByRisk(actions)
    expect(groups.get('low')?.length).toBe(2)
    expect(groups.get('medium')?.length).toBe(1)
    expect(groups.get('high')?.length).toBe(1)
  })

  test('empty array returns empty map', () => {
    const groups = groupActionsByRisk([])
    expect(groups.size).toBe(0)
  })

  test('missing risk_level defaults to low', () => {
    const actions = [
      makeAction({ id: 1, risk_level: '' }),
    ]
    const groups = groupActionsByRisk(actions)
    // groupActionsByRisk uses `a.risk_level || 'low'`, so empty string falls back to 'low'
    expect(groups.has('low')).toBe(true)
  })
})
