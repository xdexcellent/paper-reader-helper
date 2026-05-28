// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentActivitiesTable } from '../RecentActivitiesTable'
import type { Paper } from '../../../types'

/** Helper to create a minimal Paper mock */
function makePaper(overrides: Partial<Paper> & { id: number; title: string }): Paper {
  return {
    source: 'arxiv',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/tmp/paper.pdf',
    updated_at: '2024-06-01T10:00:00Z',
    ...overrides,
  }
}

describe('RecentActivitiesTable', () => {
  describe('activity derivation from papers (event type mapping)', () => {
    it('maps status "ready" to eventType "完成" and status completed', () => {
      const papers = [makePaper({ id: 1, title: 'Paper A', status: 'ready' })]
      render(<RecentActivitiesTable papers={papers} />)

      // eventType column shows "完成" and status badge also shows "完成"
      const matches = screen.getAllByText('完成')
      expect(matches.length).toBe(2) // one in eventType column, one in status badge
    })

    it('maps status "parsing" to eventType "处理中" and status processing', () => {
      const papers = [makePaper({ id: 2, title: 'Paper B', status: 'parsing' })]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText('处理中')).toBeInTheDocument()
    })

    it('maps status "summarizing" to eventType "处理中" and status processing', () => {
      const papers = [makePaper({ id: 3, title: 'Paper C', status: 'summarizing' })]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText('处理中')).toBeInTheDocument()
    })

    it('maps status "failed" to eventType "失败" and status failed', () => {
      const papers = [makePaper({ id: 4, title: 'Paper D', status: 'failed' })]
      render(<RecentActivitiesTable papers={papers} />)

      // eventType column shows "失败" and status badge also shows "失败"
      const matches = screen.getAllByText('失败')
      expect(matches.length).toBe(2) // one in eventType column, one in status badge
    })

    it('maps status "queued" to eventType "排队" and status processing', () => {
      const papers = [makePaper({ id: 5, title: 'Paper E', status: 'queued' })]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText('排队')).toBeInTheDocument()
    })
  })

  describe('sort order (descending by time)', () => {
    it('renders activities sorted by time descending (newest first)', () => {
      const papers = [
        makePaper({ id: 1, title: 'Oldest', status: 'ready', updated_at: '2024-01-01T08:00:00Z' }),
        makePaper({ id: 2, title: 'Newest', status: 'ready', updated_at: '2024-06-15T12:00:00Z' }),
        makePaper({ id: 3, title: 'Middle', status: 'ready', updated_at: '2024-03-10T10:00:00Z' }),
      ]
      render(<RecentActivitiesTable papers={papers} />)

      const rows = screen.getAllByRole('row')
      // First row is the header, data rows start at index 1
      const dataRows = rows.slice(1)
      expect(dataRows).toHaveLength(3)

      // Newest should be first
      expect(dataRows[0]).toHaveTextContent('Newest')
      expect(dataRows[1]).toHaveTextContent('Middle')
      expect(dataRows[2]).toHaveTextContent('Oldest')
    })
  })

  describe('20-record limit', () => {
    it('renders at most 20 rows when given 25 papers', () => {
      const papers = Array.from({ length: 25 }, (_, i) =>
        makePaper({
          id: i + 1,
          title: `Paper ${i + 1}`,
          status: 'ready',
          updated_at: `2024-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        })
      )
      render(<RecentActivitiesTable papers={papers} />)

      const rows = screen.getAllByRole('row')
      // 1 header row + 20 data rows = 21
      expect(rows).toHaveLength(21)
    })
  })

  describe('description truncation at 80 chars', () => {
    it('truncates paper title longer than 80 characters with ellipsis', () => {
      const longTitle = 'A'.repeat(100)
      const papers = [makePaper({ id: 1, title: longTitle, status: 'ready' })]
      render(<RecentActivitiesTable papers={papers} />)

      const truncated = 'A'.repeat(80) + '…'
      expect(screen.getByText(truncated)).toBeInTheDocument()
      expect(screen.queryByText(longTitle)).not.toBeInTheDocument()
    })

    it('does not truncate paper title with exactly 80 characters', () => {
      const exactTitle = 'B'.repeat(80)
      const papers = [makePaper({ id: 2, title: exactTitle, status: 'ready' })]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText(exactTitle)).toBeInTheDocument()
    })

    it('does not truncate paper title shorter than 80 characters', () => {
      const shortTitle = 'Short Title'
      const papers = [makePaper({ id: 3, title: shortTitle, status: 'ready' })]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText(shortTitle)).toBeInTheDocument()
    })
  })

  describe('status badge color mapping', () => {
    it('applies green color (#10B981) for completed status', () => {
      const papers = [makePaper({ id: 1, title: 'Done Paper', status: 'ready' })]
      const { container } = render(<RecentActivitiesTable papers={papers} />)

      // The badge for completed status should have green color
      const badges = container.querySelectorAll('span')
      const greenBadge = Array.from(badges).find(
        (el) => el.textContent === '完成' && el.style.color === 'rgb(16, 185, 129)'
      )
      expect(greenBadge).toBeTruthy()
    })

    it('applies blue color (#2563EB) for processing status', () => {
      const papers = [makePaper({ id: 2, title: 'Processing Paper', status: 'parsing' })]
      const { container } = render(<RecentActivitiesTable papers={papers} />)

      const badges = container.querySelectorAll('span')
      const blueBadge = Array.from(badges).find(
        (el) => el.textContent === '进行中' && el.style.color === 'rgb(37, 99, 235)'
      )
      expect(blueBadge).toBeTruthy()
    })

    it('applies red color (#EF4444) for failed status', () => {
      const papers = [makePaper({ id: 3, title: 'Failed Paper', status: 'failed' })]
      const { container } = render(<RecentActivitiesTable papers={papers} />)

      const badges = container.querySelectorAll('span')
      const redBadge = Array.from(badges).find(
        (el) => el.textContent === '失败' && el.style.color === 'rgb(239, 68, 68)'
      )
      expect(redBadge).toBeTruthy()
    })
  })

  describe('empty state rendering', () => {
    it('shows "暂无处理记录" when papers array is empty', () => {
      render(<RecentActivitiesTable papers={[]} />)

      expect(screen.getByText('暂无处理记录')).toBeInTheDocument()
    })

    it('shows "暂无处理记录" when all papers lack updated_at', () => {
      const papers = [
        makePaper({ id: 1, title: 'No Date', status: 'ready', updated_at: undefined }),
      ]
      render(<RecentActivitiesTable papers={papers} />)

      expect(screen.getByText('暂无处理记录')).toBeInTheDocument()
    })
  })
})
