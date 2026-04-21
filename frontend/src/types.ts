export type Paper = {
  id: number
  title: string
  source: string
  status: string
  parse_status: string
  summary_status: string
  embedding_status: string
  local_pdf_path: string
  primary_category_id?: number | null
  category_status?: string
  category_confidence?: number
  category_reason?: string
  tags?: string[]
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
}

export interface AutomationRunStatus {
  id: number | null
  status: string
  trigger_type: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
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
}

export interface BriefingProjectItem {
  rank: number
  title: string
  url: string
  summary: string
  source_kind: string
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
