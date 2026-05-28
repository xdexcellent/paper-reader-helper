// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopicDistributionCard } from '../TopicDistributionCard'
import type { SourceDistItem } from '../../../lib/api'

const sources: SourceDistItem[] = [
  { source: 'diffusion', count: 7 },
  { source: 'retrieval', count: 3 },
]

describe('TopicDistributionCard', () => {
  it('shows detailed donut tooltip when hovering a segment', () => {
    render(<TopicDistributionCard sources={sources} />)

    fireEvent.mouseEnter(screen.getAllByLabelText('diffusion 7 篇 70.0%')[0])

    expect(screen.getByText('主题占比')).toBeInTheDocument()
    expect(screen.getByText('7 篇论文')).toBeInTheDocument()
    expect(screen.getByText('diffusion · 70.0%')).toBeInTheDocument()
  })

  it('shows detailed donut tooltip when focusing a legend row', () => {
    render(<TopicDistributionCard sources={sources} />)

    fireEvent.focus(screen.getAllByLabelText('retrieval 3 篇 30.0%')[1])

    expect(screen.getByText('主题占比')).toBeInTheDocument()
    expect(screen.getByText('3 篇论文')).toBeInTheDocument()
    expect(screen.getByText('retrieval · 30.0%')).toBeInTheDocument()
  })
})
