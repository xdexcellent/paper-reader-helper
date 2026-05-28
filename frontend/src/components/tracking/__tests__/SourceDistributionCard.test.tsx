// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { SourceDistributionCard } from '../SourceDistributionCard'
import type { SourceDistItem } from '../../../lib/api'

describe('SourceDistributionCard', () => {
  describe('rendering with sources data', () => {
    it('renders source chips with names and counts', () => {
      const sources: SourceDistItem[] = [
        { source: 'arxiv', count: 15 },
        { source: 'manual', count: 8 },
        { source: 'openreview', count: 5 },
      ]

      render(<SourceDistributionCard sources={sources} />)

      expect(screen.getByText('来源分布')).toBeInTheDocument()
      // Source names appear in both chips and legend, so use getAllByText
      expect(screen.getAllByText('arxiv')).toHaveLength(2) // chip + legend
      expect(screen.getAllByText('manual')).toHaveLength(2)
      expect(screen.getAllByText('openreview')).toHaveLength(2)
      // Counts appear only in chips
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('renders stacked bar with aria-label', () => {
      const sources: SourceDistItem[] = [
        { source: 'arxiv', count: 10 },
        { source: 'manual', count: 5 },
      ]

      render(<SourceDistributionCard sources={sources} />)

      expect(screen.getByRole('img', { name: '来源占比分布' })).toBeInTheDocument()
    })
  })

  describe('chip truncation at 10 items', () => {
    it('shows all chips when sources <= 10', () => {
      const sources: SourceDistItem[] = Array.from({ length: 5 }, (_, i) => ({
        source: `source-${i + 1}`,
        count: 10 - i,
      }))

      render(<SourceDistributionCard sources={sources} />)

      // Each source name appears in chip + legend = 2 occurrences
      for (let i = 1; i <= 5; i++) {
        expect(screen.getAllByText(`source-${i}`).length).toBeGreaterThanOrEqual(1)
      }
      expect(screen.queryByText(/个其他/)).not.toBeInTheDocument()
    })

    it('truncates at 10 chips and shows "+N 个其他" overflow chip for 12 items', () => {
      const sources: SourceDistItem[] = Array.from({ length: 12 }, (_, i) => ({
        source: `source-${i + 1}`,
        count: 20 - i,
      }))

      render(<SourceDistributionCard sources={sources} />)

      // First 10 should be visible as chips (may also appear in legend for top 6)
      for (let i = 1; i <= 10; i++) {
        expect(screen.getAllByText(`source-${i}`).length).toBeGreaterThanOrEqual(1)
      }
      // Items 11 and 12 should NOT be visible as chips (they exceed MAX_CHIPS=10)
      expect(screen.queryByText('source-11')).not.toBeInTheDocument()
      expect(screen.queryByText('source-12')).not.toBeInTheDocument()
      // Overflow chip should show "+2 个其他"
      expect(screen.getByText('+2 个其他')).toBeInTheDocument()
    })
  })

  describe('stacked bar color limit at 6', () => {
    it('shows up to 6 distinct segments plus "其他" for overflow', () => {
      const sources: SourceDistItem[] = Array.from({ length: 8 }, (_, i) => ({
        source: `topic-${i + 1}`,
        count: 100 - i * 10,
      }))

      render(<SourceDistributionCard sources={sources} />)

      // The bar should have a segment labeled "其他" for the overflow (topics 7 & 8 merged)
      expect(screen.getByText('其他')).toBeInTheDocument()

      // Top 6 sources (sorted by count desc) should appear in legend
      for (let i = 1; i <= 6; i++) {
        expect(screen.getAllByText(`topic-${i}`).length).toBeGreaterThanOrEqual(1)
      }
    })

    it('does not show "其他" segment when sources <= 6', () => {
      const sources: SourceDistItem[] = Array.from({ length: 4 }, (_, i) => ({
        source: `topic-${i + 1}`,
        count: 10 - i,
      }))

      render(<SourceDistributionCard sources={sources} />)

      expect(screen.queryByText('其他')).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders empty state message when sources array is empty', () => {
      render(<SourceDistributionCard sources={[]} />)

      expect(screen.getByText('来源分布')).toBeInTheDocument()
      expect(screen.getByText('暂无来源数据')).toBeInTheDocument()
    })

    it('does not render stacked bar or chips in empty state', () => {
      render(<SourceDistributionCard sources={[]} />)

      expect(screen.queryByRole('img', { name: '来源占比分布' })).not.toBeInTheDocument()
    })
  })
})
