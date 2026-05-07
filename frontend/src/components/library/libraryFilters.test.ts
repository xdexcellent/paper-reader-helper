import { describe, expect, test } from 'vitest'

import type { Category, Paper } from '../../types'
import {
  collectTags,
  countParseFailedPapers,
  countPendingPapers,
  filterCategoriesByScope,
  filterPapers,
  findDuplicateByTitle,
} from './libraryFilters'

const categories: Category[] = [
  {
    id: 1,
    name: 'Pending Review',
    slug: 'pending-review',
    description: 'Needs review',
    is_system: true,
    is_active: true,
    is_pending_bucket: true,
    paper_count: 2,
    pending_count: 2,
  },
  {
    id: 2,
    name: 'Deep Learning',
    slug: 'deep-learning',
    description: 'System bucket',
    is_system: true,
    is_active: true,
    is_pending_bucket: false,
    paper_count: 3,
    pending_count: 0,
  },
  {
    id: 3,
    name: 'Personal Reading',
    slug: 'personal-reading',
    description: 'Custom bucket',
    is_system: false,
    is_active: true,
    is_pending_bucket: false,
    paper_count: 1,
    pending_count: 0,
  },
]

const papers: Paper[] = [
  {
    id: 1,
    title: 'Graph Retrieval for Agents',
    source: 'arxiv',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'completed',
    local_pdf_path: '/tmp/graph.pdf',
    primary_category_id: 2,
    category_status: 'manual_locked',
    favorite: true,
    reading_status: 'reading',
    tags: ['Agent', 'RAG'],
  },
  {
    id: 2,
    title: 'Survey of Multimodal Paper Reading',
    source: 'local',
    status: 'parse_failed',
    parse_status: 'failed',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/survey.pdf',
    primary_category_id: 1,
    category_status: 'pending_review',
    favorite: false,
    reading_status: 'read',
    tags: ['Survey', 'RAG'],
  },
  {
    id: 3,
    title: 'Efficient Library Indexes',
    source: 'zotero',
    status: 'imported',
    parse_status: 'pending',
    summary_status: 'pending',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/index.pdf',
    primary_category_id: 3,
    category_status: 'confirmed',
    favorite: true,
    reading_status: 'skipped',
    tags: ['Indexing'],
  },
]

describe('libraryFilters', () => {
  test('filters categories by system, custom, pending, and all scopes', () => {
    expect(filterCategoriesByScope(categories, 'all').map((category) => category.id)).toEqual([1, 2, 3])
    expect(filterCategoriesByScope(categories, 'system').map((category) => category.id)).toEqual([1, 2])
    expect(filterCategoriesByScope(categories, 'custom').map((category) => category.id)).toEqual([3])
    expect(filterCategoriesByScope(categories, 'pending').map((category) => category.id)).toEqual([1])
  })

  test('collects unique sorted tags while ignoring empty tag values', () => {
    const taggedPapers: Paper[] = [
      ...papers,
      { ...papers[0], id: 4, tags: ['Agent', ' ', '', 'Benchmark'] },
    ]

    expect(collectTags(taggedPapers)).toEqual(['Agent', 'Benchmark', 'Indexing', 'RAG', 'Survey'])
  })

  test('filters papers by category, title or source search, status, and active tag', () => {
    expect(
      filterPapers({
        papers,
        selectedCategoryId: 2,
        searchQuery: 'ARXIV',
        statusFilter: 'ready',
        activeTag: 'Agent',
      }).map((paper) => paper.id),
    ).toEqual([1])

    expect(
      filterPapers({
        papers,
        selectedCategoryId: null,
        searchQuery: 'local',
        statusFilter: 'all',
        activeTag: 'RAG',
      }).map((paper) => paper.id),
    ).toEqual([2])
  })

  test('filters favorite papers only', () => {
    expect(
      filterPapers({
        papers,
        selectedCategoryId: null,
        searchQuery: '',
        statusFilter: 'all',
        activeTag: null,
        favoriteFilter: 'favorites',
      }).map((paper) => paper.id),
    ).toEqual([1, 3])
  })

  test('filters papers by every reading status and treats missing status as unread', () => {
    const readingPapers: Paper[] = [
      ...papers,
      {
        ...papers[0],
        id: 4,
        title: 'Legacy paper without reading status',
        reading_status: undefined,
      },
    ]

    expect(filterPapers({
      papers: readingPapers,
      selectedCategoryId: null,
      searchQuery: '',
      statusFilter: 'all',
      activeTag: null,
      readingStatusFilter: 'reading',
    }).map((paper) => paper.id)).toEqual([1])
    expect(filterPapers({
      papers: readingPapers,
      selectedCategoryId: null,
      searchQuery: '',
      statusFilter: 'all',
      activeTag: null,
      readingStatusFilter: 'read',
    }).map((paper) => paper.id)).toEqual([2])
    expect(filterPapers({
      papers: readingPapers,
      selectedCategoryId: null,
      searchQuery: '',
      statusFilter: 'all',
      activeTag: null,
      readingStatusFilter: 'skipped',
    }).map((paper) => paper.id)).toEqual([3])
    expect(filterPapers({
      papers: readingPapers,
      selectedCategoryId: null,
      searchQuery: '',
      statusFilter: 'all',
      activeTag: null,
      readingStatusFilter: 'unread',
    }).map((paper) => paper.id)).toEqual([4])
  })

  test('combines category, status, tag, favorite, and reading-state filters', () => {
    expect(
      filterPapers({
        papers,
        selectedCategoryId: 2,
        searchQuery: 'graph',
        statusFilter: 'ready',
        activeTag: 'RAG',
        favoriteFilter: 'favorites',
        readingStatusFilter: 'reading',
      }).map((paper) => paper.id),
    ).toEqual([1])

    expect(
      filterPapers({
        papers,
        selectedCategoryId: 2,
        searchQuery: 'graph',
        statusFilter: 'ready',
        activeTag: 'RAG',
        favoriteFilter: 'favorites',
        readingStatusFilter: 'read',
      }).map((paper) => paper.id),
    ).toEqual([])
  })

  test('counts pending review papers and parse-failed papers from current statuses', () => {
    expect(countPendingPapers(papers)).toBe(1)
    expect(countParseFailedPapers(papers)).toBe(1)
  })

  test('finds duplicate titles by trimming whitespace and ignoring case', () => {
    expect(findDuplicateByTitle(papers, '  graph retrieval FOR agents  ')?.id).toBe(1)
    expect(findDuplicateByTitle(papers, 'A new paper')).toBeNull()
    expect(findDuplicateByTitle(papers, '   ')).toBeNull()
  })
})
