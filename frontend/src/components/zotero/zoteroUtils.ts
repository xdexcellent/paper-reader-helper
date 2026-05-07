import type { ZoteroCandidateResponse } from '../../types'

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  pending: '待导入',
  imported: '已导入',
  skipped: '已跳过',
  failed: '失败',
}

export function filterCandidates(
  candidates: ZoteroCandidateResponse[],
  filters: { collection?: string; tag?: string; attachment_status?: string; duplicate_status?: string; warning_status?: string },
): ZoteroCandidateResponse[] {
  let result = [...candidates]
  if (filters.collection) result = result.filter((c) => c.mapped_collections.includes(filters.collection!))
  if (filters.tag) result = result.filter((c) => c.mapped_tags.includes(filters.tag!))
  if (filters.attachment_status === 'with_attachment') result = result.filter((c) => c.attachment_exists)
  if (filters.attachment_status === 'without_attachment') result = result.filter((c) => !c.attachment_exists)
  if (filters.duplicate_status === 'duplicate') result = result.filter((c) => c.is_duplicate)
  if (filters.duplicate_status === 'unique') result = result.filter((c) => !c.is_duplicate)
  if (filters.warning_status === 'warning') result = result.filter((c) => !!c.warning_message)
  if (filters.warning_status === 'no_warning') result = result.filter((c) => !c.warning_message)
  return result
}
