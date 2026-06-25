export type ReadingStatus = 'unread' | 'reading' | 'read' | 'skipped'

export type PaperUpdatePayload = {
  title?: string
  source?: string
  authors?: string
  abstract_raw?: string
  year?: number | null
  venue?: string
  doi?: string
  url?: string
  ccf_rank_override?: string
  sci_zone_override?: string
  impact_factor_override?: string
  favorite?: boolean
  reading_status?: ReadingStatus
  reading_progress?: number
  user_notes?: string
}

export type Paper = {
  id: number
  title: string
  source: string
  authors?: string
  abstract_raw?: string
  year?: number | null
  venue?: string
  doi?: string
  url?: string
  ccf_rank?: string
  sci_zone?: string
  impact_factor?: string
  ccf_rank_override?: string
  sci_zone_override?: string
  impact_factor_override?: string
  favorite?: boolean
  reading_status?: ReadingStatus
  reading_progress?: number
  user_notes?: string
  status: string
  parse_status: string
  summary_status: string
  embedding_status: string
  local_pdf_path: string
  representative_image_url?: string
  updated_at?: string
  primary_category_id?: number | null
  category_status?: string
  category_confidence?: number
  category_reason?: string
  tags?: string[]
  venue_rank?: VenueRankInfo | null
}

export interface VenueRankInfo {
  impact_factor: string
  impact_factor_5y: string
  jcr_sci: string
  jcr_ssci: string
  cas_upgrade: string
  cas_upgrade_top: string
  cas_base: string
  cas_upgrade_small: string
  jci: string
  esi: string
  warn: string
  ei: string
  ahci: string
  cssci: string
  pku: string
  cscd: string
  utd24: string
  ft50: string
  ajg: string
  fms: string
  swufe: string
  cufe: string
  uibe: string
  sdufe: string
}

export interface EasyScholarSettings {
  api_key_set: boolean
  api_key_preview: string
  enabled: boolean
}

export interface EasyScholarSettingsUpdate {
  api_key?: string
  enabled?: boolean
}

export type PaperDetail = Paper & {
  full_markdown: string
  abstract_md: string
  introduction_md: string
  method_md: string
  conclusion_md: string
  one_line_summary: string
  core_contributions: string
  method_summary: string
  use_cases: string
  limitations: string
  relevance_note: string
}

export type PaperBlockTranslationStatus = 'completed' | 'failed' | string

export type PaperBlockTranslation = {
  id: number
  paper_id: number
  block_id: number
  target_language: string
  model_name: string
  prompt_version: string
  source_hash: string
  translated_text: string
  status: PaperBlockTranslationStatus
  error_message: string
}

export type PaperBlock = {
  id: number
  paper_id: number
  page_index: number | null
  block_index: number
  block_type: string
  text: string
  bbox: number[] | null
  asset_path?: string
  source_hash: string
  translation?: PaperBlockTranslation | null
}

export type PaperBlocksResponse = {
  paper_id: number
  total: number
  returned: number
  pages: number[]
  block_types: Record<string, number>
  has_blocks: boolean
  blocks: PaperBlock[]
  error: string
}

export type PaperBlockRebuildResponse = {
  paper_id: number
  block_count: number
  has_blocks: boolean
}

export type PaperBlockFilters = {
  page?: number | null
  type?: string
  search?: string
}

export type BlockTranslatePayload = {
  target_language?: string
  model?: string
  force_refresh?: boolean
}

export type Category = {
  id: number
  name: string
  slug: string
  description: string
  parent_id?: number | null
  is_system: boolean
  is_active: boolean
  is_pending_bucket: boolean
  sort_order?: number
  paper_count: number
  pending_count: number
}

export type CategoryScope = 'all' | 'system' | 'custom' | 'pending'

export interface AutomationSettings {
  enabled: boolean
  schedule_time: string
  timezone: string
  top_n: number
  briefing_enabled: boolean
  project_sidebar_enabled: boolean
  http_proxy?: string | null
  https_proxy?: string | null
  research_direction?: string
  research_keywords?: string
}

export interface AiProviderSettings {
  provider_name: string
  api_base: string
  api_key_set: boolean
  api_key_preview: string
  default_model: string
  available_models: string[]
}

export interface AiProviderSettingsUpdate {
  provider_name?: string
  api_base?: string
  api_key?: string
  default_model?: string
  available_models?: string[]
}

export interface AutomationRunStatus {
  id: number | null
  status: string
  trigger_type: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  progress: number
  progress_message: string
  subscription_issues?: AutomationSubscriptionIssue[]
}

export interface AutomationSubscriptionIssue {
  subscription_id: number | null
  subscription_name: string
  source_kind: string
  severity: 'warning' | 'error' | string
  message: string
}

export interface AutomationTodayStatus {
  local_today: string
  enabled: boolean
  briefing_enabled: boolean
  schedule_time: string
  timezone: string
  today_run: AutomationRunStatus | null
  today_briefing_exists: boolean
  fallback_used: boolean
  fallback_briefing_date: string | null
}

export interface BriefingPaperItem {
  paper_id: number | null
  rank: number
  score: number
  reason: string
  source_kind: string
  title?: string
  summary_text?: string
  canonical_url?: string
  pdf_url?: string
}

export interface BriefingProjectItem {
  rank: number
  title: string
  url: string
  summary: string
  source_kind: string
}

export interface BriefingFailedItem {
  title: string
  source_kind: string
  canonical_url?: string
  pdf_url?: string
  reason: string
}

export interface DailyBriefingSnapshot {
  briefing_date: string
  status: string
  generated_at: string
  daily_run_id?: number | null
  trigger_type?: string | null
  summary_markdown: string
  paper_count: number
  project_count: number
  source_count: number
  fallback_used: boolean
  top_papers: BriefingPaperItem[]
  projects: BriefingProjectItem[]
  failed_items?: BriefingFailedItem[]
}

export interface DailyBriefingHistoryItem {
  briefing_date: string
  status: string
  generated_at: string
  daily_run_id?: number | null
  trigger_type?: string | null
  summary_markdown: string
  paper_count: number
  project_count: number
  source_count: number
}

// ─── Agent ──────────────────────────────────────────────────
export type AgentScopeConfig = {
  scope_type: 'whole_library' | 'category' | 'papers' | 'reader_paper'
  category_id?: number | null
  paper_ids?: number[]
}

export type AgentToolEvent = {
  id: number
  tool_name: string
  input_summary: string
  output_summary: string
  status: string
  error_message: string
}

export type AgentAction = {
  id: number
  agent_run_id: number
  action_type: string
  target_paper_id?: number | null
  target_category_id?: number | null
  before_values: Record<string, unknown>
  after_values: Record<string, unknown>
  rationale: string
  confidence: number
  risk_level: string
  status: string
  revert_action_id?: number | null
  rejection_reason: string
  error_message: string
}

export type AgentRunResponse = {
  id: number
  prompt: string
  scope: AgentScopeConfig
  model: string
  status: string
  chat_session_id?: number | null
  actions: AgentAction[]
  tool_events: AgentToolEvent[]
  created_at: string
  updated_at: string
}

export type BatchApproveResponse = {
  applied: number
  skipped: number
  failed: number
  rejected: number
}

export type AgentRunCreatePayload = {
  prompt: string
  scope: AgentScopeConfig
  model?: string
  thinking?: string
  chat_session_id?: number | null
}

// ─── Zotero ─────────────────────────────────────────────────
export type ZoteroRunResponse = {
  id: number
  source_fingerprint: string
  status: string
  imported_count: number
  skipped_count: number
  duplicate_count: number
  warning_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

export type ZoteroCandidateResponse = {
  id: number
  import_run_id: number
  source_key: string
  mapped_title: string
  mapped_authors: string
  mapped_year?: number | null
  mapped_doi: string
  mapped_url: string
  mapped_venue: string
  mapped_collections: string[]
  mapped_tags: string[]
  attachment_exists: boolean
  is_duplicate: boolean
  duplicate_of_paper_id?: number | null
  duplicate_reason: string
  is_selected: boolean
  warning_message: string
  import_status: string
}

export type ZoteroCandidateFilter = {
  collection?: string
  tag?: string
  attachment_status?: string
  duplicate_status?: string
  warning_status?: string
}

export type ZoteroImportConfirm = {
  allow_metadata_only: boolean
}

export type EffectiveRank = {
  ccf: string
  sciZone: string
  impactFactor: string
}

export function effectiveRank(paper: Pick<Paper, 'ccf_rank' | 'sci_zone' | 'impact_factor' | 'ccf_rank_override' | 'sci_zone_override' | 'impact_factor_override'>): EffectiveRank {
  return {
    ccf: paper.ccf_rank_override?.trim() || paper.ccf_rank || '',
    sciZone: paper.sci_zone_override?.trim() || paper.sci_zone || '',
    impactFactor: paper.impact_factor_override?.trim() || paper.impact_factor || '',
  }
}
