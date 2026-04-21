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
  fetchPapers,
  runTodayBriefing,
  updateAutomationSettings,
  updatePaperCategory,
} from './api'

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
