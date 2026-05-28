// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TrackingTopbar } from '../TrackingTopbar'

vi.mock('../../dashboard/DashboardToast', () => ({
  showToast: vi.fn(),
}))

const defaultProps = {
  onSearch: vi.fn(),
  onViewReport: vi.fn(),
  onOpenSettings: vi.fn(),
}

describe('TrackingTopbar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('does not show an unread badge when all notifications are read', () => {
    render(<TrackingTopbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument()
    expect(document.querySelector('.academic-tracking-notification-badge')).not.toBeInTheDocument()
  })

  it('does not render the generate briefing button in the topbar actions', () => {
    render(<TrackingTopbar {...defaultProps} />)

    expect(screen.queryByRole('button', { name: /生成简报|生成中/ })).not.toBeInTheDocument()
  })
})
