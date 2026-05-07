import { describe, expect, test } from 'vitest'
import { filterCandidates } from './zoteroUtils'
import type { ZoteroCandidateResponse } from '../../types'

function makeCandidate(overrides: Partial<ZoteroCandidateResponse> = {}): ZoteroCandidateResponse {
  return {
    id: 1,
    import_run_id: 1,
    source_key: 'ABC123',
    mapped_title: 'Test Paper',
    mapped_authors: 'Author One',
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
    ...overrides,
  }
}

describe('filterCandidates', () => {
  test('returns all when no filters', () => {
    const candidates = [makeCandidate(), makeCandidate({ id: 2 })]
    expect(filterCandidates(candidates, {})).toHaveLength(2)
  })

  test('filters by collection', () => {
    const candidates = [
      makeCandidate({ id: 1, mapped_collections: ['AI'] }),
      makeCandidate({ id: 2, mapped_collections: ['ML'] }),
    ]
    expect(filterCandidates(candidates, { collection: 'AI' })).toHaveLength(1)
  })

  test('filters by tag', () => {
    const candidates = [
      makeCandidate({ id: 1, mapped_tags: ['nlp'] }),
      makeCandidate({ id: 2, mapped_tags: ['cv'] }),
    ]
    expect(filterCandidates(candidates, { tag: 'nlp' })).toHaveLength(1)
  })

  test('filters by attachment status with_attachment', () => {
    const candidates = [
      makeCandidate({ id: 1, attachment_exists: true }),
      makeCandidate({ id: 2, attachment_exists: false }),
    ]
    expect(filterCandidates(candidates, { attachment_status: 'with_attachment' })).toHaveLength(1)
  })

  test('filters by attachment status without_attachment', () => {
    const candidates = [
      makeCandidate({ id: 1, attachment_exists: true }),
      makeCandidate({ id: 2, attachment_exists: false }),
    ]
    expect(filterCandidates(candidates, { attachment_status: 'without_attachment' })).toHaveLength(1)
  })

  test('filters by duplicate status', () => {
    const candidates = [
      makeCandidate({ id: 1, is_duplicate: true }),
      makeCandidate({ id: 2, is_duplicate: false }),
    ]
    expect(filterCandidates(candidates, { duplicate_status: 'duplicate' })).toHaveLength(1)
    expect(filterCandidates(candidates, { duplicate_status: 'unique' })).toHaveLength(1)
  })

  test('filters by warning status', () => {
    const candidates = [
      makeCandidate({ id: 1, warning_message: 'Missing file' }),
      makeCandidate({ id: 2, warning_message: '' }),
    ]
    expect(filterCandidates(candidates, { warning_status: 'warning' })).toHaveLength(1)
    expect(filterCandidates(candidates, { warning_status: 'no_warning' })).toHaveLength(1)
  })

  test('combines multiple filters', () => {
    const candidates = [
      makeCandidate({ id: 1, mapped_collections: ['AI'], is_duplicate: true }),
      makeCandidate({ id: 2, mapped_collections: ['AI'], is_duplicate: false }),
      makeCandidate({ id: 3, mapped_collections: ['ML'], is_duplicate: false }),
    ]
    expect(filterCandidates(candidates, { collection: 'AI', duplicate_status: 'unique' })).toHaveLength(1)
  })
})
