// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ResearchRhythmCard } from '../ResearchRhythmCard'
import type { DailyStatsItem } from '../../../lib/api'

describe('ResearchRhythmCard', () => {
  describe('metric calculations', () => {
    it('calculates daily average from the active range with 1 decimal', () => {
      // 7 days with counts [3, 0, 5, 2, 0, 1, 4] -> total = 15, avg = 15/7 = 2.1
      const dailyData: DailyStatsItem[] = [
        { date: '2024-01-01', count: 3 },
        { date: '2024-01-02', count: 0 },
        { date: '2024-01-03', count: 5 },
        { date: '2024-01-04', count: 2 },
        { date: '2024-01-05', count: 0 },
        { date: '2024-01-06', count: 1 },
        { date: '2024-01-07', count: 4 },
      ]

      render(<ResearchRhythmCard dailyData={dailyData} />)

      expect(screen.getByText('2.1')).toBeInTheDocument()
      expect(screen.getByText('日均导入量')).toBeInTheDocument()
    })

    it('uses rangeDays when the caller changes the tracking range', () => {
      const dailyData: DailyStatsItem[] = [
        { date: '2024-01-01', count: 3 },
        { date: '2024-01-02', count: 0 },
        { date: '2024-01-03', count: 5 },
        { date: '2024-01-04', count: 2 },
        { date: '2024-01-05', count: 0 },
        { date: '2024-01-06', count: 1 },
        { date: '2024-01-07', count: 4 },
      ]

      render(<ResearchRhythmCard dailyData={dailyData} rangeDays={30} />)

      expect(screen.getByText('0.5')).toBeInTheDocument()
      expect(screen.getByText(/过去 30 天/)).toBeInTheDocument()
    })

    it('calculates active days as count of days with count > 0', () => {
      // Use data where active days (3) differs from peak (7) and avg
      const dailyData: DailyStatsItem[] = [
        { date: '2024-01-01', count: 7 },
        { date: '2024-01-02', count: 0 },
        { date: '2024-01-03', count: 2 },
        { date: '2024-01-04', count: 0 },
        { date: '2024-01-05', count: 0 },
        { date: '2024-01-06', count: 0 },
        { date: '2024-01-07', count: 1 },
      ]

      render(<ResearchRhythmCard dailyData={dailyData} />)

      // active days = 3 (days with count > 0: 7, 2, 1)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('活跃天数')).toBeInTheDocument()
    })

    it('calculates peak day as the maximum count', () => {
      // Use data where peak (8) is distinct from active days (4) and avg
      const dailyData: DailyStatsItem[] = [
        { date: '2024-01-01', count: 2 },
        { date: '2024-01-02', count: 0 },
        { date: '2024-01-03', count: 8 },
        { date: '2024-01-04', count: 1 },
        { date: '2024-01-05', count: 0 },
        { date: '2024-01-06', count: 0 },
        { date: '2024-01-07', count: 3 },
      ]

      render(<ResearchRhythmCard dailyData={dailyData} />)

      // peak = max(2, 0, 8, 1, 0, 0, 3) = 8
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('峰值日导入量')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty message when dailyData is empty', () => {
      render(<ResearchRhythmCard dailyData={[]} />)

      expect(screen.getByText(/暂无导入记录/)).toBeInTheDocument()
    })

    it('does not show metrics when dailyData is empty', () => {
      render(<ResearchRhythmCard dailyData={[]} />)

      expect(screen.queryByText('日均导入量')).not.toBeInTheDocument()
      expect(screen.queryByText('活跃天数')).not.toBeInTheDocument()
      expect(screen.queryByText('峰值日导入量')).not.toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows skeleton when loading is true', () => {
      const { container } = render(
        <ResearchRhythmCard dailyData={[]} loading={true} />
      )

      // Should not show empty state or metrics when loading
      expect(screen.queryByText(/暂无导入记录/)).not.toBeInTheDocument()
      expect(screen.queryByText('日均导入量')).not.toBeInTheDocument()

      // Should render skeleton blocks (3 skeleton blocks in a row)
      const skeletonBlocks = container.querySelectorAll('div > div > div > div')
      expect(skeletonBlocks.length).toBeGreaterThan(0)
    })
  })
})
