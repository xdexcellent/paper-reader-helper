// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  UNAUTHORIZED_EVENT,
  checkAuthStatus,
  createCategory,
  deletePaper,
  fetchAutomationSettings,
  fetchAutomationStatusToday,
  fetchBriefing,
  fetchBriefingHistory,
  fetchCategories,
  fetchPaperBlocks,
  fetchPapers,
  rebuildPaperBlocks,
  runTodayBriefing,
  translatePaperBlock,
  updateAutomationSettings,
  updatePaper,
  updatePaperCategory,
  updatePaperFavorite,
  updatePaperNotes,
  updatePaperReadingState,
  uploadPaper,
} from './api'

function paperResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Reader Ready',
    source: 'manual',
    authors: '',
    abstract_raw: '',
    year: null,
    venue: '',
    doi: '',
    url: '',
    favorite: false,
    reading_status: 'unread',
    reading_progress: 0,
    user_notes: '',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/tmp/sample.pdf',
    tags: [],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('checkAuthStatus sends stored token and returns authentication state', async () => {
  localStorage.setItem('auth_token', 'token-123')
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      requires_password: true,
      authenticated: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const status = await checkAuthStatus()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/auth/status', {
    headers: { Authorization: 'Bearer token-123' },
  })
  expect(status).toEqual({
    requires_password: true,
    authenticated: true,
  })
})

test('fetchPapers dispatches unauthorized event when backend returns 401', async () => {
  localStorage.setItem('auth_token', 'expired-token')
  const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  await expect(fetchPapers()).rejects.toThrow('登录已过期，请重新登录')

  expect(dispatchSpy).toHaveBeenCalledTimes(1)
  const [event] = dispatchSpy.mock.calls[0]
  expect(event).toBeInstanceOf(CustomEvent)
  expect(event.type).toBe(UNAUTHORIZED_EVENT)
  expect((event as CustomEvent<{ message: string }>).detail.message).toBe('登录已过期，请重新登录')
})

test('deletePaper also dispatches unauthorized event for manual non-JSON checks', async () => {
  localStorage.setItem('auth_token', 'expired-token')
  const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true)
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  await expect(deletePaper(1)).rejects.toThrow('登录已过期，请重新登录')

  expect(dispatchSpy).toHaveBeenCalledTimes(1)
  const [event] = dispatchSpy.mock.calls[0]
  expect(event.type).toBe(UNAUTHORIZED_EVENT)
})

test('fetchCategories reads controlled category directories', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify([
      { id: 1, name: '待确认', is_pending_bucket: true, paper_count: 2, pending_count: 2 },
      { id: 2, name: '强化学习', is_pending_bucket: false, paper_count: 4, pending_count: 1 },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await fetchCategories()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/categories', { headers: {} })
  expect(payload[1].name).toBe('强化学习')
})

test('createCategory posts a custom directory request', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 14,
      name: '我的专题',
      slug: '我的专题',
      description: 'Manual research bucket',
      is_system: false,
      is_active: true,
      is_pending_bucket: false,
      paper_count: 0,
      pending_count: 0,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await createCategory({ name: '我的专题', description: 'Manual research bucket' })

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '我的专题', description: 'Manual research bucket' }),
  })
  expect(payload.id).toBe(14)
})

test('updatePaperCategory sends manual primary category changes', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'completed',
      local_pdf_path: '/tmp/sample.pdf',
      primary_category_id: 3,
      category_status: 'manual_locked',
      category_confidence: 1,
      category_reason: 'Manual assignment',
      tags: ['强化学习'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await updatePaperCategory(1, 3)

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/papers/1/category', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primary_category_id: 3 }),
  })
  expect(payload.category_status).toBe('manual_locked')
})

test('updatePaper sends Phase 2 metadata as a JSON patch body', async () => {
  localStorage.setItem('auth_token', 'token-123')
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(paperResponse({
      title: 'Updated Metadata',
      favorite: true,
      reading_status: 'reading',
      reading_progress: 35,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  const payload = {
    title: 'Updated Metadata',
    authors: 'Ada Lovelace',
    abstract_raw: 'Readable abstract.',
    year: 2026,
    venue: 'ICLR',
    doi: '10.1234/example',
    url: 'https://example.com/paper',
    favorite: true,
    reading_status: 'reading' as const,
    reading_progress: 35,
    user_notes: 'Important for survey.',
  }

  const updated = await updatePaper(1, payload)

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/papers/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
    body: JSON.stringify(payload),
  })
  expect(updated.favorite).toBe(true)
  expect(updated.reading_status).toBe('reading')
})

test('favorite, reading state, and notes wrappers delegate typed payloads', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify(paperResponse({ favorite: true })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify(paperResponse({
      reading_status: 'read',
      reading_progress: 100,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify(paperResponse({
      user_notes: 'Ready to cite.',
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

  await updatePaperFavorite(1, true)
  await updatePaperReadingState(1, { reading_status: 'read', reading_progress: 100 })
  await updatePaperNotes(1, 'Ready to cite.')

  expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/papers/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite: true }),
  })
  expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/papers/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reading_status: 'read', reading_progress: 100 }),
  })
  expect(fetch).toHaveBeenNthCalledWith(3, 'http://localhost:8000/papers/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_notes: 'Ready to cite.' }),
  })
})

test('paper block wrappers build list, rebuild, and translate requests', async () => {
  localStorage.setItem('auth_token', 'token-123')
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({
      paper_id: 1,
      total: 2,
      returned: 1,
      pages: [0, 1],
      block_types: { table: 1, text: 1 },
      has_blocks: true,
      blocks: [{
        id: 10,
        paper_id: 1,
        page_index: 1,
        block_index: 2,
        block_type: 'table',
        text: 'Neural results',
        bbox: [1, 2, 3, 4],
        source_hash: 'hash-10',
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      paper_id: 1,
      block_count: 3,
      has_blocks: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      id: 7,
      paper_id: 1,
      block_id: 10,
      target_language: 'zh-CN',
      model_name: 'gpt-5.4',
      prompt_version: 'block-translate-v1',
      source_hash: 'hash-10',
      translated_text: '翻译结果',
      status: 'completed',
      error_message: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

  const blocks = await fetchPaperBlocks(1, { page: 1, type: 'table', search: 'neural' })
  const rebuild = await rebuildPaperBlocks(1)
  const translation = await translatePaperBlock(1, 10, {
    target_language: 'zh-CN',
    model: 'gpt-5.4',
    force_refresh: true,
  })

  expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/papers/1/blocks?page=1&type=table&search=neural', {
    headers: { Authorization: 'Bearer token-123' },
  })
  expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/papers/1/blocks/rebuild', {
    method: 'POST',
    headers: { Authorization: 'Bearer token-123' },
  })
  expect(fetch).toHaveBeenNthCalledWith(3, 'http://localhost:8000/papers/1/blocks/10/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
    body: JSON.stringify({
      target_language: 'zh-CN',
      model: 'gpt-5.4',
      force_refresh: true,
    }),
  })
  expect(blocks.blocks[0].block_type).toBe('table')
  expect(rebuild.block_count).toBe(3)
  expect(translation.translated_text).toBe('翻译结果')
})

test('fetchPaperBlocks surfaces backend errors through readJson', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
    detail: 'No parse artifact available',
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  }))

  await expect(fetchPaperBlocks(1)).rejects.toThrow('No parse artifact available')
})

test('uploadPaper sends confirmed title when provided', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 12,
      title: 'Confirmed Import Title',
      source: 'manual',
      status: 'queued',
      parse_status: 'pending',
      summary_status: 'pending',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/confirmed.pdf',
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  const file = new File(['pdf'], 'confirmed.pdf', { type: 'application/pdf' })

  const payload = await uploadPaper({
    source: 'manual',
    title: '  Confirmed Import Title  ',
    file,
  })

  expect(fetch).toHaveBeenCalledTimes(1)
  const [, init] = vi.mocked(fetch).mock.calls[0]
  const body = init?.body
  expect(body).toBeInstanceOf(FormData)
  expect((body as FormData).get('source')).toBe('manual')
  expect((body as FormData).get('title')).toBe('Confirmed Import Title')
  expect((body as FormData).get('pdf_file')).toBe(file)
  expect(payload.title).toBe('Confirmed Import Title')
})

test('fetchBriefing reads today snapshot by default', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      briefing_date: '2026-04-19',
      status: 'completed',
      generated_at: '2026-04-19T12:00:00+08:00',
      summary_markdown: '今日精选',
      paper_count: 5,
      project_count: 2,
      source_count: 4,
      fallback_used: false,
      top_papers: [],
      projects: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await fetchBriefing()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/briefing/today', { headers: {} })
  expect(payload.briefing_date).toBe('2026-04-19')
  expect(payload.top_papers).toEqual([])
})

test('fetchBriefing reads a requested snapshot date', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      briefing_date: '2026-04-18',
      status: 'completed',
      generated_at: '2026-04-18T12:00:00+08:00',
      summary_markdown: '历史日报',
      paper_count: 3,
      project_count: 1,
      source_count: 2,
      fallback_used: false,
      top_papers: [],
      projects: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await fetchBriefing('2026-04-18')

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/briefing/2026-04-18', { headers: {} })
  expect(payload.briefing_date).toBe('2026-04-18')
})

test('automation settings api reads and updates schedule settings', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({
        enabled: true,
        schedule_time: '12:00',
        timezone: 'Asia/Shanghai',
        top_n: 5,
        briefing_enabled: true,
        project_sidebar_enabled: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({
        enabled: true,
        schedule_time: '13:00',
        timezone: 'Asia/Shanghai',
        top_n: 5,
        briefing_enabled: true,
        project_sidebar_enabled: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  const current = await fetchAutomationSettings()
  const updated = await updateAutomationSettings({ ...current, schedule_time: '13:00' })

  expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/automation/settings', { headers: {} })
  expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/automation/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...current, schedule_time: '13:00' }),
  })
  expect(updated.schedule_time).toBe('13:00')
})

test('runTodayBriefing dispatches manual daily run', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ run_id: 7, status: 'completed' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await runTodayBriefing()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/automation/runs/today', {
    method: 'POST',
    headers: {},
  })
  expect(payload).toEqual({ run_id: 7, status: 'completed' })
})


test('fetchBriefingHistory reads recent briefing snapshots', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify([
      {
        briefing_date: '2026-04-19',
        status: 'completed',
        generated_at: '2026-04-19T12:00:00+08:00',
        daily_run_id: 1,
        trigger_type: 'scheduled',
        summary_markdown: '今日精选',
        paper_count: 1,
        project_count: 1,
        source_count: 2,
      },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await fetchBriefingHistory()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/briefing/history?days=7', { headers: {} })
  expect(payload[0].briefing_date).toBe('2026-04-19')
})


test('fetchAutomationStatusToday reads automation state for the local day', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      local_today: '2026-04-19',
      enabled: true,
      briefing_enabled: true,
      schedule_time: '12:00',
      timezone: 'Asia/Shanghai',
      today_run: null,
      today_briefing_exists: false,
      fallback_used: true,
      fallback_briefing_date: '2026-04-18',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const payload = await fetchAutomationStatusToday()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/automation/status/today', { headers: {} })
  expect(payload.fallback_briefing_date).toBe('2026-04-18')
})

// ─── Agent API ──────────────────────────────────────────────
import {
  createAgentRun,
  fetchAgentRuns,
  approveAgentAction,
  batchApproveAgentActions,
  rejectAgentAction,
  revertAgentAction,
} from './api'

test('createAgentRun sends POST to /agent/runs with correct body', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 1,
      prompt: '整理我的论文库',
      scope: { scope_type: 'whole_library' },
      model: 'gpt-5.4',
      status: 'completed',
      actions: [],
      tool_events: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await createAgentRun({
    prompt: '整理我的论文库',
    scope: { scope_type: 'whole_library' },
  })

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: '整理我的论文库',
      scope: { scope_type: 'whole_library' },
    }),
  })
  expect(result.id).toBe(1)
  expect(result.status).toBe('completed')
})

test('fetchAgentRuns sends GET to /agent/runs', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify([{
      id: 1,
      prompt: 'test',
      scope: { scope_type: 'whole_library' },
      model: 'gpt-5.4',
      status: 'completed',
      actions: [],
      tool_events: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await fetchAgentRuns()

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/runs', { headers: {} })
  expect(result).toHaveLength(1)
  expect(result[0].id).toBe(1)
})

test('approveAgentAction sends POST to /agent/actions/{id}/approve', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 5,
      agent_run_id: 1,
      action_type: 'update_tags',
      before_values: { tags: [] },
      after_values: { tags: ['llm'] },
      rationale: 'test',
      confidence: 0.9,
      risk_level: 'low',
      status: 'executed',
      rejection_reason: '',
      error_message: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await approveAgentAction(5)

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/actions/5/approve', {
    method: 'POST',
    headers: {},
  })
  expect(result.status).toBe('executed')
})

test('batchApproveAgentActions sends POST with action_ids', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      applied: 2,
      skipped: 0,
      failed: 0,
      rejected: 0,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await batchApproveAgentActions(1, [10, 11])

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/runs/1/approve-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_ids: [10, 11] }),
  })
  expect(result.applied).toBe(2)
})

test('rejectAgentAction sends POST with reason', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 5,
      agent_run_id: 1,
      action_type: 'update_tags',
      before_values: {},
      after_values: {},
      rationale: '',
      confidence: 0,
      risk_level: 'low',
      status: 'rejected',
      rejection_reason: '不需要',
      error_message: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await rejectAgentAction(5, '不需要')

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/actions/5/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: '不需要' }),
  })
  expect(result.status).toBe('rejected')
})

test('revertAgentAction sends POST to /agent/actions/{id}/revert', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 6,
      agent_run_id: 1,
      action_type: 'update_tags',
      before_values: {},
      after_values: {},
      rationale: '',
      confidence: 0,
      risk_level: 'low',
      status: 'reverted',
      revert_action_id: 5,
      rejection_reason: '',
      error_message: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await revertAgentAction(5)

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/agent/actions/5/revert', {
    method: 'POST',
    headers: {},
  })
  expect(result.status).toBe('reverted')
})

// ─── Zotero API ─────────────────────────────────────────────
import {
  scanZotero,
  fetchZoteroCandidates,
  importZoteroCandidates,
} from './api'

test('scanZotero sends POST to /zotero/import-runs/scan', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 1,
      source_fingerprint: 'abc123',
      status: 'scanning',
      imported_count: 0,
      skipped_count: 0,
      duplicate_count: 0,
      warning_count: 0,
      failed_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await scanZotero('/path/to/zotero.sqlite')

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/zotero/import-runs/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_path: '/path/to/zotero.sqlite' }),
  })
  expect(result.id).toBe(1)
  expect(result.status).toBe('scanning')
})

test('fetchZoteroCandidates sends GET with filters as query params', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify([{
      id: 1,
      import_run_id: 1,
      source_key: 'ABC123',
      mapped_title: 'Test',
      mapped_authors: 'Author',
      mapped_year: 2024,
      mapped_doi: '',
      mapped_url: '',
      mapped_venue: '',
      mapped_collections: ['AI'],
      mapped_tags: ['llm'],
      attachment_exists: true,
      is_duplicate: false,
      duplicate_reason: '',
      is_selected: true,
      warning_message: '',
      import_status: 'pending',
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await fetchZoteroCandidates(1, {
    collection: 'AI',
    duplicate_status: 'unique',
  })

  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:8000/zotero/import-runs/1/candidates?collection=AI&duplicate_status=unique',
    { headers: {} },
  )
  expect(result).toHaveLength(1)
  expect(result[0].mapped_title).toBe('Test')
})

test('importZoteroCandidates sends POST with allow_metadata_only', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({
      id: 1,
      source_fingerprint: 'abc',
      status: 'completed',
      imported_count: 3,
      skipped_count: 1,
      duplicate_count: 0,
      warning_count: 1,
      failed_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  const result = await importZoteroCandidates(1, { allow_metadata_only: true })

  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/zotero/import-runs/1/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allow_metadata_only: true }),
  })
  expect(result.imported_count).toBe(3)
})
