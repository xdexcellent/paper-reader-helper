import { describe, expect, test } from 'vitest'

import { createHeadingId, extractMarkdownHeadings, hasMarkdownContent } from './readerUtils'

describe('reader markdown utilities', () => {
  test('extracts markdown headings with stable anchor ids', () => {
    expect(extractMarkdownHeadings('# Paper Title\n\nIntro\n\n## Method Details\n\nText\n\n### Results')).toEqual([
      { id: 'paper-title', level: 1, text: 'Paper Title' },
      { id: 'method-details', level: 2, text: 'Method Details' },
      { id: 'results', level: 3, text: 'Results' },
    ])
  })

  test('deduplicates repeated heading ids in document order', () => {
    expect(extractMarkdownHeadings('## Method\n\n### Method\n\n## Method!').map((heading) => heading.id)).toEqual([
      'method',
      'method-2',
      'method-3',
    ])
  })

  test('creates fallback ids and detects markdown content', () => {
    expect(createHeadingId('***', new Map())).toBe('section')
    expect(hasMarkdownContent('   \n  ')).toBe(false)
    expect(hasMarkdownContent('\n# Ready\n')).toBe(true)
  })
})
