// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompletionTrendChart } from '../CompletionTrendChart'
import { ImportTrendChart } from '../ImportTrendChart'
import type { DailyStatsItem } from '../../../lib/api'

const dailyData: DailyStatsItem[] = [
  { date: '2024-01-01', count: 3 },
  { date: '2024-01-02', count: 5 },
]

describe('tracking trend chart details', () => {
  it('shows import details when hovering a histogram hit area', () => {
    render(<ImportTrendChart data={dailyData} />)

    fireEvent.mouseEnter(screen.getByLabelText('2024-01-02 导入 5 篇'))

    expect(screen.getByText('5 篇论文')).toBeInTheDocument()
    expect(screen.getByText('01-02 · 导入')).toBeInTheDocument()
  })

  it('shows completion details when hovering a histogram hit area', () => {
    render(<CompletionTrendChart data={dailyData} />)

    fireEvent.mouseEnter(screen.getByLabelText('2024-01-01 完成 3 篇'))

    expect(screen.getByText('3 篇论文')).toBeInTheDocument()
    expect(screen.getByText('01-01 · 完成')).toBeInTheDocument()
  })

  it('shows import details when focusing a histogram hit area', () => {
    render(<ImportTrendChart data={dailyData} />)

    fireEvent.focus(screen.getByLabelText('2024-01-01 导入 3 篇'))

    expect(screen.getByText('3 篇论文')).toBeInTheDocument()
    expect(screen.getByText('01-01 · 导入')).toBeInTheDocument()
  })
})
