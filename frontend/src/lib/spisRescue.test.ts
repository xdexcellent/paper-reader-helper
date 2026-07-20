import { describe, expect, it } from 'vitest'

import {
  isFailedItemRescueEligible,
  isMetadataOnlyPaper,
  isPaperRescueEligible,
  spisStatusLabel,
} from './spisRescue'

describe('spisRescue helpers', () => {
  it('detects metadata-only papers', () => {
    expect(isMetadataOnlyPaper({ local_pdf_path: '', source_pdf_status: 'metadata_only' })).toBe(true)
    expect(isMetadataOnlyPaper({ local_pdf_path: '/a.pdf', source_pdf_status: 'metadata_only' })).toBe(false)
  })

  it('checks rescue eligibility', () => {
    expect(isPaperRescueEligible({
      local_pdf_path: '',
      source_pdf_status: 'restricted',
      spis_status: 'available_for_rescue',
      title: 'A',
    })).toBe(true)
    expect(isPaperRescueEligible({
      local_pdf_path: '/a.pdf',
      source_pdf_status: 'available',
      spis_status: 'recovered',
      title: 'A',
    })).toBe(false)
  })

  it('checks failed item rescue eligibility and labels', () => {
    expect(isFailedItemRescueEligible({
      title: 'A',
      source_kind: 'crossref',
      reason: 'x',
      paper_id: 1,
      rescue_eligible: true,
    })).toBe(true)
    expect(spisStatusLabel('manual_required')).toBe('需人工确认')
  })
})
