// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TrackingKpiCard } from '../TrackingKpiCard'

const defaultProps = {
  label: '总文章数',
  value: 42,
  note: '较上周 +5',
  icon: <span data-testid="mock-icon">📊</span>,
  iconColor: '#2563EB',
}

describe('TrackingKpiCard', () => {
  describe('normal rendering', () => {
    it('renders value, label, and note', () => {
      render(<TrackingKpiCard {...defaultProps} />)

      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('总文章数')).toBeInTheDocument()
      expect(screen.getByText('较上周 +5')).toBeInTheDocument()
    })

    it('renders the icon', () => {
      render(<TrackingKpiCard {...defaultProps} />)

      expect(screen.getByTestId('mock-icon')).toBeInTheDocument()
    })
  })

  describe('interactive state', () => {
    it('renders as a button and calls onClick when interactive', () => {
      const onClick = vi.fn()
      render(<TrackingKpiCard {...defaultProps} onClick={onClick} />)

      const button = screen.getByRole('button', { name: '查看总文章数详情' })
      expect(button).toHaveClass('tracking-kpi-card--interactive')

      fireEvent.click(button)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not expose the card as a button while loading', () => {
      const onClick = vi.fn()
      render(<TrackingKpiCard {...defaultProps} loading onClick={onClick} />)

      expect(screen.queryByRole('button', { name: '查看总文章数详情' })).not.toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows skeleton placeholders when loading', () => {
      const { container } = render(<TrackingKpiCard {...defaultProps} loading />)

      const skeleton = container.querySelector('.tracking-kpi-skeleton')
      expect(skeleton).toBeInTheDocument()
      // Value, label, and note should not be visible
      expect(screen.queryByText('42')).not.toBeInTheDocument()
      expect(screen.queryByText('总文章数')).not.toBeInTheDocument()
      expect(screen.queryByText('较上周 +5')).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows "--" placeholder when error is true', () => {
      render(<TrackingKpiCard {...defaultProps} error />)

      expect(screen.getByText('--')).toBeInTheDocument()
      expect(screen.queryByText('42')).not.toBeInTheDocument()
    })

    it('shows retry button when error and onRetry provided', () => {
      const onRetry = vi.fn()
      render(<TrackingKpiCard {...defaultProps} error onRetry={onRetry} />)

      const retryButton = screen.getByRole('button', { name: /重试加载总文章数/ })
      expect(retryButton).toBeInTheDocument()
      expect(retryButton).toHaveTextContent('重试')
    })

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()
      render(<TrackingKpiCard {...defaultProps} error onRetry={onRetry} />)

      fireEvent.click(screen.getByRole('button', { name: /重试加载总文章数/ }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not show retry button when onRetry is not provided', () => {
      render(<TrackingKpiCard {...defaultProps} error />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('still shows the label in error state', () => {
      render(<TrackingKpiCard {...defaultProps} error />)

      expect(screen.getByText('总文章数')).toBeInTheDocument()
    })
  })

  describe('thousands separator formatting', () => {
    it('formats 1234 as "1,234"', () => {
      render(<TrackingKpiCard {...defaultProps} value={1234} />)

      expect(screen.getByText('1,234')).toBeInTheDocument()
    })

    it('formats 1000000 as "1,000,000"', () => {
      render(<TrackingKpiCard {...defaultProps} value={1000000} />)

      expect(screen.getByText('1,000,000')).toBeInTheDocument()
    })

    it('formats 0 as "0"', () => {
      render(<TrackingKpiCard {...defaultProps} value={0} />)

      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('formats 999 without separator', () => {
      render(<TrackingKpiCard {...defaultProps} value={999} />)

      expect(screen.getByText('999')).toBeInTheDocument()
    })
  })

  describe('percentage formatting', () => {
    it('formats "85.3%" with 1 decimal place', () => {
      render(<TrackingKpiCard {...defaultProps} value="85.3%" />)

      expect(screen.getByText('85.3%')).toBeInTheDocument()
    })

    it('formats "85%" as "85.0%"', () => {
      render(<TrackingKpiCard {...defaultProps} value="85%" />)

      expect(screen.getByText('85.0%')).toBeInTheDocument()
    })

    it('formats "100%" as "100.0%"', () => {
      render(<TrackingKpiCard {...defaultProps} value="100%" />)

      expect(screen.getByText('100.0%')).toBeInTheDocument()
    })

    it('formats "0%" as "0.0%"', () => {
      render(<TrackingKpiCard {...defaultProps} value="0%" />)

      expect(screen.getByText('0.0%')).toBeInTheDocument()
    })

    it('passes through non-percentage strings as-is', () => {
      render(<TrackingKpiCard {...defaultProps} value="N/A" />)

      expect(screen.getByText('N/A')).toBeInTheDocument()
    })
  })

  describe('hover animation class', () => {
    it('applies tracking-kpi-card class to the card container', () => {
      const { container } = render(<TrackingKpiCard {...defaultProps} />)

      const card = container.querySelector('.tracking-kpi-card')
      expect(card).toBeInTheDocument()
    })
  })
})
