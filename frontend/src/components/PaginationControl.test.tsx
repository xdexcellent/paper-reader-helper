// @vitest-environment jsdom

import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PaginationControl } from './PaginationControl'

test('renders previous/next buttons and page indicators', () => {
  render(<PaginationControl currentPage={1} totalPages={5} onPageChange={() => {}} />)

  expect(screen.getByLabelText('上一页')).toBeDefined()
  expect(screen.getByLabelText('下一页')).toBeDefined()
  expect(screen.getByText('共 5 页')).toBeDefined()
  // All 5 page numbers should be visible
  for (let i = 1; i <= 5; i++) {
    expect(screen.getByLabelText(`第 ${i} 页`)).toBeDefined()
  }
})

test('disables previous button on first page', () => {
  render(<PaginationControl currentPage={1} totalPages={5} onPageChange={() => {}} />)

  const prevBtn = screen.getByLabelText('上一页')
  expect(prevBtn).toBeDisabled()
})

test('disables next button on last page', () => {
  render(<PaginationControl currentPage={5} totalPages={5} onPageChange={() => {}} />)

  const nextBtn = screen.getByLabelText('下一页')
  expect(nextBtn).toBeDisabled()
})

test('enables both buttons on middle page', () => {
  render(<PaginationControl currentPage={3} totalPages={5} onPageChange={() => {}} />)

  expect(screen.getByLabelText('上一页')).not.toBeDisabled()
  expect(screen.getByLabelText('下一页')).not.toBeDisabled()
})

test('calls onPageChange with previous page when clicking prev', () => {
  const onPageChange = vi.fn()
  render(<PaginationControl currentPage={3} totalPages={5} onPageChange={onPageChange} />)

  fireEvent.click(screen.getByLabelText('上一页'))
  expect(onPageChange).toHaveBeenCalledWith(2)
})

test('calls onPageChange with next page when clicking next', () => {
  const onPageChange = vi.fn()
  render(<PaginationControl currentPage={3} totalPages={5} onPageChange={onPageChange} />)

  fireEvent.click(screen.getByLabelText('下一页'))
  expect(onPageChange).toHaveBeenCalledWith(4)
})

test('calls onPageChange with page number when clicking a page button', () => {
  const onPageChange = vi.fn()
  render(<PaginationControl currentPage={1} totalPages={5} onPageChange={onPageChange} />)

  fireEvent.click(screen.getByLabelText('第 4 页'))
  expect(onPageChange).toHaveBeenCalledWith(4)
})

test('shows all pages when totalPages <= 7', () => {
  render(<PaginationControl currentPage={4} totalPages={7} onPageChange={() => {}} />)

  for (let i = 1; i <= 7; i++) {
    expect(screen.getByLabelText(`第 ${i} 页`)).toBeDefined()
  }
})

test('shows ellipsis when totalPages > 7 and current page is in the middle', () => {
  render(<PaginationControl currentPage={5} totalPages={10} onPageChange={() => {}} />)

  // Should show: 1 ... 4 5 6 ... 10
  expect(screen.getByLabelText('第 1 页')).toBeDefined()
  expect(screen.getByLabelText('第 4 页')).toBeDefined()
  expect(screen.getByLabelText('第 5 页')).toBeDefined()
  expect(screen.getByLabelText('第 6 页')).toBeDefined()
  expect(screen.getByLabelText('第 10 页')).toBeDefined()
  // Ellipsis characters should be present
  const ellipses = screen.getAllByText('…')
  expect(ellipses.length).toBe(2)
})

test('shows ellipsis only after range when current page is near start', () => {
  render(<PaginationControl currentPage={2} totalPages={10} onPageChange={() => {}} />)

  // Should show: 1 2 3 ... 10
  expect(screen.getByLabelText('第 1 页')).toBeDefined()
  expect(screen.getByLabelText('第 2 页')).toBeDefined()
  expect(screen.getByLabelText('第 3 页')).toBeDefined()
  expect(screen.getByLabelText('第 10 页')).toBeDefined()
  const ellipses = screen.getAllByText('…')
  expect(ellipses.length).toBe(1)
})

test('shows ellipsis only before range when current page is near end', () => {
  render(<PaginationControl currentPage={9} totalPages={10} onPageChange={() => {}} />)

  // Should show: 1 ... 8 9 10
  expect(screen.getByLabelText('第 1 页')).toBeDefined()
  expect(screen.getByLabelText('第 8 页')).toBeDefined()
  expect(screen.getByLabelText('第 9 页')).toBeDefined()
  expect(screen.getByLabelText('第 10 页')).toBeDefined()
  const ellipses = screen.getAllByText('…')
  expect(ellipses.length).toBe(1)
})

test('marks current page with aria-current="page"', () => {
  render(<PaginationControl currentPage={3} totalPages={5} onPageChange={() => {}} />)

  const activeBtn = screen.getByLabelText('第 3 页')
  expect(activeBtn).toHaveAttribute('aria-current', 'page')

  // Other pages should not have aria-current
  const otherBtn = screen.getByLabelText('第 1 页')
  expect(otherBtn).not.toHaveAttribute('aria-current')
})

test('handles single page (totalPages = 1)', () => {
  render(<PaginationControl currentPage={1} totalPages={1} onPageChange={() => {}} />)

  expect(screen.getByLabelText('上一页')).toBeDisabled()
  expect(screen.getByLabelText('下一页')).toBeDisabled()
  expect(screen.getByLabelText('第 1 页')).toBeDefined()
  expect(screen.getByText('共 1 页')).toBeDefined()
})
