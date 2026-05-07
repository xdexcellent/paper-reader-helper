// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  scanZotero: vi.fn(),
  fetchZoteroCandidates: vi.fn(),
  updateCandidateSelection: vi.fn(),
  importZoteroCandidates: vi.fn(),
}))

vi.mock('../../lib/api', () => apiMocks)

import { ZoteroImportPage } from './ZoteroImportPage'

beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset()
    }
  })
  apiMocks.scanZotero.mockRejectedValue(new Error('not called'))
  apiMocks.fetchZoteroCandidates.mockRejectedValue(new Error('not called'))
  apiMocks.updateCandidateSelection.mockRejectedValue(new Error('not called'))
  apiMocks.importZoteroCandidates.mockRejectedValue(new Error('not called'))
})

function makeCandidate(overrides = {}) {
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

test('renders source form', () => {
  render(<ZoteroImportPage />)

  expect(screen.getByLabelText('Zotero 数据库路径')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '扫描 Zotero 数据库' })).toBeInTheDocument()
})

test('scan button disabled when input is empty', () => {
  render(<ZoteroImportPage />)

  expect(screen.getByRole('button', { name: '扫描 Zotero 数据库' })).toBeDisabled()
})

test('can scan and display candidates', async () => {
  apiMocks.scanZotero.mockResolvedValue({
    id: 1,
    source_fingerprint: 'abc',
    status: 'ready',
    imported_count: 0,
    skipped_count: 0,
    duplicate_count: 0,
    warning_count: 0,
    failed_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  apiMocks.fetchZoteroCandidates.mockResolvedValue([
    makeCandidate({ mapped_title: 'Deep Learning Paper' }),
  ])

  render(<ZoteroImportPage />)

  fireEvent.change(screen.getByLabelText('Zotero 数据库路径'), {
    target: { value: '/path/to/zotero.sqlite' },
  })
  fireEvent.click(screen.getByRole('button', { name: '扫描 Zotero 数据库' }))

  await waitFor(() => expect(apiMocks.scanZotero).toHaveBeenCalledWith('/path/to/zotero.sqlite'))
  expect(await screen.findByText('Deep Learning Paper')).toBeInTheDocument()
  // "有附件" appears both in the filter dropdown option and in the badge, so use getAllByText
  expect(screen.getAllByText('有附件').length).toBeGreaterThanOrEqual(1)
})

test('shows error on scan failure', async () => {
  apiMocks.scanZotero.mockRejectedValue(new Error('文件不可读'))

  render(<ZoteroImportPage />)

  fireEvent.change(screen.getByLabelText('Zotero 数据库路径'), {
    target: { value: '/invalid/path.sqlite' },
  })
  fireEvent.click(screen.getByRole('button', { name: '扫描 Zotero 数据库' }))

  expect(await screen.findByText('文件不可读')).toBeInTheDocument()
})

test('shows duplicate badge for duplicate candidates', async () => {
  apiMocks.scanZotero.mockResolvedValue({
    id: 1,
    source_fingerprint: 'abc',
    status: 'ready',
    imported_count: 0,
    skipped_count: 0,
    duplicate_count: 0,
    warning_count: 0,
    failed_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  apiMocks.fetchZoteroCandidates.mockResolvedValue([
    makeCandidate({ id: 1, mapped_title: 'Duplicate Paper', is_duplicate: true, is_selected: false }),
  ])

  render(<ZoteroImportPage />)

  fireEvent.change(screen.getByLabelText('Zotero 数据库路径'), {
    target: { value: '/path/to/zotero.sqlite' },
  })
  fireEvent.click(screen.getByRole('button', { name: '扫描 Zotero 数据库' }))

  expect(await screen.findByText('与已有论文重复')).toBeInTheDocument()
})

test('shows import confirmation controls when candidates loaded', async () => {
  apiMocks.scanZotero.mockResolvedValue({
    id: 1,
    source_fingerprint: 'abc',
    status: 'ready',
    imported_count: 0,
    skipped_count: 0,
    duplicate_count: 0,
    warning_count: 0,
    failed_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  apiMocks.fetchZoteroCandidates.mockResolvedValue([makeCandidate()])

  render(<ZoteroImportPage />)

  fireEvent.change(screen.getByLabelText('Zotero 数据库路径'), {
    target: { value: '/path/to/zotero.sqlite' },
  })
  fireEvent.click(screen.getByRole('button', { name: '扫描 Zotero 数据库' }))

  expect(await screen.findByLabelText('允许仅导入元数据')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认导入选中的候选' })).toBeInTheDocument()
})
