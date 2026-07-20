import type { BriefingFailedItem, Paper } from '../types'

export function isMetadataOnlyPaper(paper: Pick<Paper, 'local_pdf_path' | 'source_pdf_status'> | null | undefined): boolean {
  if (!paper) return false
  if ((paper.local_pdf_path || '').trim()) return false
  const status = (paper.source_pdf_status || '').trim()
  return status === 'metadata_only' || status === 'restricted' || status === ''
}

export function isPaperRescueEligible(paper: Pick<Paper, 'local_pdf_path' | 'source_pdf_status' | 'spis_status' | 'title' | 'doi'> | null | undefined): boolean {
  if (!paper) return false
  if ((paper.local_pdf_path || '').trim() && (paper.source_pdf_status || '') === 'available') {
    return false
  }
  if ((paper.spis_status || '') === 'recovered' && (paper.local_pdf_path || '').trim()) {
    return false
  }
  if ((paper.spis_status || '') === 'queued' || (paper.spis_status || '') === 'running') {
    return false
  }
  return Boolean((paper.title || '').trim() || (paper.doi || '').trim())
}

export function isFailedItemRescueEligible(item: BriefingFailedItem): boolean {
  if (item.rescue_eligible) return true
  if (!item.paper_id) return false
  const status = (item.spis_status || '').trim()
  if (status === 'recovered' || status === 'queued' || status === 'running') return false
  return true
}

export function spisStatusLabel(status?: string | null): string {
  switch ((status || '').trim()) {
    case 'available_for_rescue':
      return '待补救'
    case 'queued':
      return '已排队'
    case 'running':
      return '补救中'
    case 'recovered':
      return '已补救'
    case 'manual_required':
      return '需人工确认'
    case 'failed':
      return '补救失败'
    case 'blocked_global':
      return '全局阻塞'
    default:
      return status ? status : '待补救'
  }
}

export function sourcePdfStatusLabel(status?: string | null): string {
  switch ((status || '').trim()) {
    case 'metadata_only':
      return '仅元数据 / 待补救'
    case 'restricted':
      return 'PDF 受限 / 待补救'
    case 'available':
      return 'PDF 可用'
    default:
      return status || ''
  }
}
