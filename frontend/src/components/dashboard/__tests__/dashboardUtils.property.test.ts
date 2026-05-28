import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildDashboardNavigationItems, buildWeeklyData, estimateCompletionLabel, filterPapers } from '../dashboardUtils'
import type { Paper } from '../../../types'
import type { MockPaper } from '../mockData'

/**
 * Feature: work-dashboard-page
 * Property 1: Paper filtering preserves category invariants
 *
 * **Validates: Requirements 7.2, 7.3**
 *
 * For any array of papers (each with an isRead boolean) and any selected filter
 * ("全部", "未读", "已读"), the filtered result SHALL satisfy:
 * - If filter is "全部", the result contains all papers (length equals input length)
 * - If filter is "未读", every paper in the result has isRead === false
 * - If filter is "已读", every paper in the result has isRead === true
 * - The count of "未读" papers plus the count of "已读" papers equals the count of "全部" papers
 */
describe('Feature: work-dashboard-page, Property 1: Paper filtering preserves category invariants', () => {
  // Generate a minimal MockPaper with random isRead
  const paperArb = fc.record({
    id: fc.string({ minLength: 1 }),
    title: fc.string(),
    source: fc.string(),
    date: fc.string(),
    citations: fc.nat(),
    tags: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
    relevanceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    abstract: fc.string(),
    project: fc.string(),
    isRead: fc.boolean(),
    thumbnailUrl: fc.string(),
  }) as fc.Arbitrary<MockPaper>

  it('"全部" filter returns all papers', () => {
    fc.assert(
      fc.property(fc.array(paperArb), (papers) => {
        const result = filterPapers(papers, '全部')
        expect(result).toHaveLength(papers.length)
      }),
      { numRuns: 100 }
    )
  })

  it('"未读" filter returns only papers with isRead === false', () => {
    fc.assert(
      fc.property(fc.array(paperArb), (papers) => {
        const result = filterPapers(papers, '未读')
        for (const paper of result) {
          expect(paper.isRead).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('"已读" filter returns only papers with isRead === true', () => {
    fc.assert(
      fc.property(fc.array(paperArb), (papers) => {
        const result = filterPapers(papers, '已读')
        for (const paper of result) {
          expect(paper.isRead).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('count("未读") + count("已读") === count("全部")', () => {
    fc.assert(
      fc.property(fc.array(paperArb), (papers) => {
        const all = filterPapers(papers, '全部')
        const unread = filterPapers(papers, '未读')
        const read = filterPapers(papers, '已读')
        expect(unread.length + read.length).toBe(all.length)
      }),
      { numRuns: 100 }
    )
  })
})

describe('dashboard dynamic data utilities', () => {
  it('buildWeeklyData uses daily stats when available', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const result = buildWeeklyData([], [
      { date: '2026-05-05', count: 1 },
      { date: '2026-05-06', count: 2 },
      { date: '2026-05-07', count: 3 },
      { date: '2026-05-08', count: 4 },
      { date: '2026-05-09', count: 5 },
      { date: '2026-05-10', count: 6 },
      { date: '2026-05-11', count: 7 },
    ], now)

    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('buildWeeklyData falls back to paper update dates', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const papers = [
      makePaper({ id: 1, updated_at: '2026-05-10T08:00:00Z' }),
      makePaper({ id: 2, updated_at: '2026-05-10T09:00:00Z' }),
      makePaper({ id: 3, updated_at: '2026-05-11T09:00:00Z' }),
    ]

    expect(buildWeeklyData(papers, [], now)).toEqual([0, 0, 0, 0, 0, 2, 1])
  })

  it('estimateCompletionLabel derives from pending count and adjustable minutes', () => {
    const now = new Date(2026, 4, 11, 8, 0, 0)

    expect(estimateCompletionLabel(3, 20, now)).toBe('09:00')
    expect(estimateCompletionLabel(0, 20, now)).toBe('已完成')
  })

  it('buildDashboardNavigationItems reflects current paper and briefing counts', () => {
    const items = buildDashboardNavigationItems({
      papers: [
        makePaper({ id: 1, reading_status: 'read' }),
        makePaper({ id: 2, reading_status: 'unread' }),
      ],
      briefing: {
        briefing_date: '2026-05-11',
        status: 'completed',
        generated_at: '2026-05-11T08:00:00Z',
        summary_markdown: '',
        paper_count: 9,
        project_count: 2,
        source_count: 4,
        fallback_used: false,
        top_papers: [],
        projects: [],
      },
    })

    expect(items.find(item => item.id === 'nav-dashboard')?.subtitle).toBe('今日 9 篇候选')
    expect(items.find(item => item.id === 'nav-academic-tracking')?.subtitle).toBe('1/2 篇已读')
  })
})

function makePaper(overrides: Partial<Paper> & { id: number }): Paper {
  const { id, ...rest } = overrides
  return {
    id,
    title: `Paper ${id}`,
    source: 'arxiv',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '',
    ...rest,
  }
}
