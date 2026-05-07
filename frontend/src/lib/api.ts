import type {
  AutomationSettings,
  AutomationTodayStatus,
  BlockTranslatePayload,
  Category,
  DailyBriefingHistoryItem,
  DailyBriefingSnapshot,
  PaperBlockFilters,
  PaperBlockRebuildResponse,
  PaperBlocksResponse,
  PaperBlockTranslation,
  Paper,
  PaperDetail,
  PaperUpdatePayload,
  ReadingStatus,
  AgentRunCreatePayload,
  AgentRunResponse,
  AgentAction,
  BatchApproveResponse,
  ZoteroRunResponse,
  ZoteroCandidateResponse,
  ZoteroCandidateFilter,
  ZoteroImportConfirm,
} from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
export const UNAUTHORIZED_EVENT = 'paper-reader:unauthorized'

interface ReadJsonOptions {
  reportUnauthorized?: boolean
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readErrorMessage(response: Response, fallback = '请求失败，请稍后重试'): Promise<string> {
  let message = fallback
  try {
    const payload = await response.json()
    message = payload.detail ?? message
  } catch {
    // ignore
  }
  return message
}

function reportUnauthorized(message: string): void {
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, {
    detail: { message },
  }))
}

async function readJson<T>(response: Response, options: ReadJsonOptions = {}): Promise<T> {
  if (!response.ok) {
    const message = await readErrorMessage(response)
    if (options.reportUnauthorized !== false && response.status === 401) {
      reportUnauthorized(message)
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

async function ensureOk(response: Response, fallback: string, options: ReadJsonOptions = {}): Promise<void> {
  if (response.ok) return

  const message = await readErrorMessage(response, fallback)
  if (options.reportUnauthorized !== false && response.status === 401) {
    reportUnauthorized(message)
  }
  throw new Error(message)
}

// ─── Auth ──────────────────────────────────────────────────
export async function checkAuthStatus(): Promise<{ requires_password: boolean; authenticated: boolean }> {
  const response = await fetch(`${API_BASE}/auth/status`, {
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

export async function loginApi(password: string): Promise<{ token: string }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return readJson(response, { reportUnauthorized: false })
}

// ─── Papers ────────────────────────────────────────────────
export async function fetchPapers(): Promise<Paper[]> {
  const response = await fetch(`${API_BASE}/papers`, { headers: getAuthHeaders() })
  return readJson<Paper[]>(response)
}

export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch(`${API_BASE}/categories`, { headers: getAuthHeaders() })
  return readJson<Category[]>(response)
}

export async function createCategory(data: { name: string; description?: string }): Promise<Category> {
  const response = await fetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  })
  return readJson<Category>(response)
}

export async function fetchPaperDetail(id: number): Promise<PaperDetail> {
  const response = await fetch(`${API_BASE}/papers/${id}`, { headers: getAuthHeaders() })
  return readJson<PaperDetail>(response)
}

export async function uploadPaper(payload: { source: string; title?: string; file: File }): Promise<Paper> {
  const formData = new FormData()
  formData.append('source', payload.source)
  const title = payload.title?.trim()
  if (title) {
    formData.append('title', title)
  }
  formData.append('pdf_file', payload.file)

  const response = await fetch(`${API_BASE}/papers/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  })
  return readJson<Paper>(response)
}

export async function importPaperFromUrl(request: { title: string; source: string; source_id: string; url: string; authors?: string; abstract?: string; published_at?: string }): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/import_url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(request),
  })
  return readJson<Paper>(response)
}

export async function parsePaper(id: number): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/papers/${id}/parse`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

export async function summarizePaper(id: number, model: string = 'gpt-5.4'): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/papers/${id}/summarize?model=${encodeURIComponent(model)}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

export interface TaskStatusResponse {
  id: string
  type: string
  paper_id: number | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress_message: string
  created_at: string
  completed_at: string | null
  error: string | null
}

export async function fetchTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    headers: getAuthHeaders(),
  })
  return readJson<TaskStatusResponse>(response)
}

export async function waitForTaskCompletion(
  taskId: string,
  timeoutMs = 600000,
  intervalMs = 2000,
): Promise<TaskStatusResponse> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    const task = await fetchTaskStatus(taskId)
    if (task.status === 'completed') return task
    if (task.status === 'failed') throw new Error(task.error || '任务执行失败')
  }
  throw new Error('任务超时')
}

export async function deletePaper(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/papers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  await ensureOk(response, '删除失败')
}

export async function searchPapers(params: { q?: string; status?: string; source?: string }): Promise<Paper[]> {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.append('q', params.q)
  if (params.status) searchParams.append('status', params.status)
  if (params.source) searchParams.append('source', params.source)

  const response = await fetch(`${API_BASE}/papers/search?${searchParams.toString()}`, { headers: getAuthHeaders() })
  return readJson<Paper[]>(response)
}

export async function updatePaper(id: number, data: PaperUpdatePayload): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  })
  return readJson<Paper>(response)
}

export async function updatePaperFavorite(id: number, favorite: boolean): Promise<Paper> {
  return updatePaper(id, { favorite })
}

export async function updatePaperReadingState(
  id: number,
  payload: { reading_status?: ReadingStatus; reading_progress?: number },
): Promise<Paper> {
  return updatePaper(id, payload)
}

export async function updatePaperNotes(id: number, user_notes: string): Promise<Paper> {
  return updatePaper(id, { user_notes })
}

export async function updatePaperCategory(paperId: number, primaryCategoryId: number): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ primary_category_id: primaryCategoryId }),
  })
  return readJson<Paper>(response)
}

export async function fetchPaperBlocks(
  paperId: number,
  filters: PaperBlockFilters = {},
): Promise<PaperBlocksResponse> {
  const params = new URLSearchParams()
  if (filters.page !== undefined && filters.page !== null) {
    params.set('page', String(filters.page))
  }
  if (filters.type) {
    params.set('type', filters.type)
  }
  if (filters.search) {
    params.set('search', filters.search)
  }
  const query = params.toString()
  const response = await fetch(`${API_BASE}/papers/${paperId}/blocks${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  })
  return readJson<PaperBlocksResponse>(response)
}

export async function rebuildPaperBlocks(paperId: number): Promise<PaperBlockRebuildResponse> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/blocks/rebuild`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson<PaperBlockRebuildResponse>(response)
}

export async function translatePaperBlock(
  paperId: number,
  blockId: number,
  payload: BlockTranslatePayload = {},
): Promise<PaperBlockTranslation> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/blocks/${blockId}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  return readJson<PaperBlockTranslation>(response)
}

// ─── Chat (legacy quick chat) ──────────────────────────────
export async function sendChatMessage(messages: {role: string, content: string}[], paperId?: number, model?: string): Promise<string> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      messages,
      paper_id: paperId,
      model: model,
    }),
  })
  const data = await readJson<{ reply: string }>(response)
  return data.reply
}

// ─── Chat Sessions (persistent) ────────────────────────────
export interface ChatSessionResponse {
  id: number
  title: string
  paper_id: number | null
  model: string
  created_at: string
  updated_at: string
}

export interface ChatMessageResponse {
  id: number
  session_id: number
  role: string
  content: string
  created_at: string
}

export interface ChatSessionDetailResponse extends ChatSessionResponse {
  messages: ChatMessageResponse[]
}

export async function createChatSession(data: {
  title?: string
  paper_id?: number | null
  model?: string
}): Promise<ChatSessionResponse> {
  const response = await fetch(`${API_BASE}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  })
  return readJson(response)
}

export async function fetchChatSessions(): Promise<ChatSessionResponse[]> {
  const response = await fetch(`${API_BASE}/chat/sessions`, { headers: getAuthHeaders() })
  return readJson(response)
}

export async function fetchChatSessionDetail(id: number): Promise<ChatSessionDetailResponse> {
  const response = await fetch(`${API_BASE}/chat/sessions/${id}`, { headers: getAuthHeaders() })
  return readJson(response)
}

export async function deleteChatSession(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/sessions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  await ensureOk(response, '删除失败')
}

export async function sendSessionMessage(sessionId: number, content: string, paperId?: number | null, model?: string): Promise<{ reply: string }> {
  const payload: any = { content }
  if (paperId !== undefined) {
    // sending -1 will clear it in the backend
    payload.paper_id = paperId === null ? -1 : paperId
  }
  if (model) {
    payload.model = model
  }
  
  const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

// ─── Stats ─────────────────────────────────────────────────
export interface StatsOverview {
  total: number
  ready: number
  parsed: number
  summarized: number
  pending: number
  processing: number
  completion_rate: number
}

export interface DailyStatsItem {
  date: string
  count: number
}

export interface SourceDistItem {
  source: string
  count: number
}

export async function fetchStatsOverview(): Promise<StatsOverview> {
  const response = await fetch(`${API_BASE}/stats/overview`, { headers: getAuthHeaders() })
  return readJson(response)
}

export async function fetchDailyStats(days: number = 7): Promise<DailyStatsItem[]> {
  const response = await fetch(`${API_BASE}/stats/daily?days=${days}`, { headers: getAuthHeaders() })
  return readJson(response)
}

export async function fetchSourceDist(): Promise<SourceDistItem[]> {
  const response = await fetch(`${API_BASE}/stats/sources`, { headers: getAuthHeaders() })
  return readJson(response)
}

// ─── Briefing ──────────────────────────────────────────────
export type BriefingResponse = DailyBriefingSnapshot

export async function fetchAutomationSettings(): Promise<AutomationSettings> {
  const response = await fetch(`${API_BASE}/automation/settings`, { headers: getAuthHeaders() })
  return readJson<AutomationSettings>(response)
}

export async function updateAutomationSettings(payload: AutomationSettings): Promise<AutomationSettings> {
  const response = await fetch(`${API_BASE}/automation/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  return readJson<AutomationSettings>(response)
}

export async function runTodayBriefing(): Promise<{ run_id: number | null; status: string }> {
  const response = await fetch(`${API_BASE}/automation/runs/today`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

export async function fetchBriefing(date?: string): Promise<DailyBriefingSnapshot> {
  const path = date ? `/briefing/${encodeURIComponent(date)}` : '/briefing/today'
  const response = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() })
  return readJson<DailyBriefingSnapshot>(response)
}

export async function fetchBriefingHistory(days = 7): Promise<DailyBriefingHistoryItem[]> {
  const response = await fetch(`${API_BASE}/briefing/history?days=${days}`, { headers: getAuthHeaders() })
  return readJson<DailyBriefingHistoryItem[]>(response)
}

export async function fetchAutomationStatusToday(): Promise<AutomationTodayStatus> {
  const response = await fetch(`${API_BASE}/automation/status/today`, { headers: getAuthHeaders() })
  return readJson<AutomationTodayStatus>(response)
}

// ─── Recommendations ───────────────────────────────────────
export interface RecommendationItem {
  paper: Paper
  score: number
  reason: string
  tag?: string
  priority_icon?: string
  future_direction?: string
  category?: 'read_now' | 'summarize_next' | 'process_next' | 'recover' | string
  category_label?: string
  status_label?: string
  action_label?: string
  action_hint?: string
  confidence?: number
  signals?: string[]
  score_breakdown?: string[]
}

export async function fetchRecommendations(options?: {
  force?: boolean
  model?: string
}): Promise<RecommendationItem[]> {
  const params = new URLSearchParams()
  if (options?.force) params.set('force', 'true')
  if (options?.model) params.set('model', options.model)
  const qs = params.toString()
  const url = `${API_BASE}/recommendations${qs ? `?${qs}` : ''}`
  const response = await fetch(url, { headers: getAuthHeaders() })
  return readJson(response)
}

// ─── PDF ───────────────────────────────────────────────────
export function getPdfUrl(paperId: number): string {
  return `${API_BASE}/papers/${paperId}/pdf`
}

export async function getPdfBlobUrl(paperId: number): Promise<string> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/pdf`, {
    headers: getAuthHeaders(),
  });
  await ensureOk(response, '无法加载 PDF (身份验证失败或文件不存在)')
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ─── Tags ──────────────────────────────────────────────────
export async function updatePaperTags(paperId: number, tags: string[]): Promise<Paper> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ tags }),
  })
  return readJson(response)
}

export async function fetchAllTags(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/papers/tags/all`, { headers: getAuthHeaders() })
  return readJson(response)
}

// ─── Semantic Search ───────────────────────────────────────
export interface SemanticSearchResult {
  paper: Paper
  similarity: number
}

export async function semanticSearch(query: string, topK: number = 10): Promise<SemanticSearchResult[]> {
  const response = await fetch(`${API_BASE}/papers/search/semantic?query=${encodeURIComponent(query)}&top_k=${topK}`, {
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

// ─── Embedding ─────────────────────────────────────────────
export async function embedPaper(paperId: number): Promise<{ task_id: string; message: string }> {
  const response = await fetch(`${API_BASE}/papers/${paperId}/embed`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

// ─── Agent ──────────────────────────────────────────────────
export async function createAgentRun(payload: AgentRunCreatePayload): Promise<AgentRunResponse> {
  const response = await fetch(`${API_BASE}/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  return readJson<AgentRunResponse>(response)
}

export async function fetchAgentRuns(): Promise<AgentRunResponse[]> {
  const response = await fetch(`${API_BASE}/agent/runs`, { headers: getAuthHeaders() })
  return readJson<AgentRunResponse[]>(response)
}

export async function fetchAgentRunDetail(runId: number): Promise<AgentRunResponse> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}`, { headers: getAuthHeaders() })
  return readJson<AgentRunResponse>(response)
}

export async function approveAgentAction(actionId: number): Promise<AgentAction> {
  const response = await fetch(`${API_BASE}/agent/actions/${actionId}/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson<AgentAction>(response)
}

export async function batchApproveAgentActions(runId: number, actionIds: number[]): Promise<BatchApproveResponse> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}/approve-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ action_ids: actionIds }),
  })
  return readJson<BatchApproveResponse>(response)
}

export async function rejectAgentAction(actionId: number, reason?: string): Promise<AgentAction> {
  const response = await fetch(`${API_BASE}/agent/actions/${actionId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ reason: reason || '' }),
  })
  return readJson<AgentAction>(response)
}

export async function revertAgentAction(actionId: number): Promise<AgentAction> {
  const response = await fetch(`${API_BASE}/agent/actions/${actionId}/revert`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson<AgentAction>(response)
}

// ─── Zotero ─────────────────────────────────────────────────
export async function scanZotero(sourcePath: string): Promise<ZoteroRunResponse> {
  const response = await fetch(`${API_BASE}/zotero/import-runs/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ source_path: sourcePath }),
  })
  return readJson<ZoteroRunResponse>(response)
}

export async function fetchZoteroRun(runId: number): Promise<ZoteroRunResponse> {
  const response = await fetch(`${API_BASE}/zotero/import-runs/${runId}`, { headers: getAuthHeaders() })
  return readJson<ZoteroRunResponse>(response)
}

export async function fetchZoteroCandidates(runId: number, filters: ZoteroCandidateFilter = {}): Promise<ZoteroCandidateResponse[]> {
  const params = new URLSearchParams()
  if (filters.collection) params.set('collection', filters.collection)
  if (filters.tag) params.set('tag', filters.tag)
  if (filters.attachment_status) params.set('attachment_status', filters.attachment_status)
  if (filters.duplicate_status) params.set('duplicate_status', filters.duplicate_status)
  if (filters.warning_status) params.set('warning_status', filters.warning_status)
  const qs = params.toString()
  const response = await fetch(`${API_BASE}/zotero/import-runs/${runId}/candidates${qs ? '?' + qs : ''}`, {
    headers: getAuthHeaders(),
  })
  return readJson<ZoteroCandidateResponse[]>(response)
}

export async function updateCandidateSelection(runId: number, candidateId: number, isSelected: boolean): Promise<ZoteroCandidateResponse> {
  const response = await fetch(`${API_BASE}/zotero/import-runs/${runId}/candidates/${candidateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ is_selected: isSelected }),
  })
  return readJson<ZoteroCandidateResponse>(response)
}

export async function importZoteroCandidates(runId: number, confirm: ZoteroImportConfirm): Promise<ZoteroRunResponse> {
  const response = await fetch(`${API_BASE}/zotero/import-runs/${runId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(confirm),
  })
  return readJson<ZoteroRunResponse>(response)
}
