// @vitest-environment jsdom

// EmbeddingNotice 组件和 useHealthCheck hook 测试
// 覆盖 Phase 5：embedding 不可用时的 UI 提示

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// ─── EmbeddingUnavailableNotice 组件测试 ────────────────────────────────

// 注意：EmbeddingNotice 导入 useHealthCheck，我们需要 mock fetch
// 以及 mock useHealthCheck 来测试不同状态

// 先 mock useHealthCheck hook
const mockUseHealthCheck = vi.fn()

vi.mock('./useHealthCheck', () => ({
  useHealthCheck: () => mockUseHealthCheck(),
}))

// 现在导入组件（在 mock 之后）
import { EmbeddingUnavailableNotice } from './EmbeddingNotice'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('loading 状态时不显示通知', () => {
  // 模拟正在加载
  mockUseHealthCheck.mockReturnValue({ health: null, isLoading: true })

  const { container } = render(<EmbeddingUnavailableNotice />)

  // loading 状态下组件应返回 null
  expect(container.textContent).toBe('')
})

test('health 为 null（后端未就绪）时不显示通知', () => {
  // 模拟后端未就绪
  mockUseHealthCheck.mockReturnValue({ health: null, isLoading: false })

  const { container } = render(<EmbeddingUnavailableNotice />)

  expect(container.textContent).toBe('')
})

test('embedding 可用时不显示通知', () => {
  // 模拟 embedding 可用
  mockUseHealthCheck.mockReturnValue({
    health: { status: 'ok', embedding_available: true },
    isLoading: false,
  })

  const { container } = render(<EmbeddingUnavailableNotice />)

  // embedding 可用时，不需要提示
  expect(container.textContent).toBe('')
})

test('embedding 不可用时显示安装提示通知', () => {
  // 模拟 embedding 不可用
  mockUseHealthCheck.mockReturnValue({
    health: { status: 'ok', embedding_available: false },
    isLoading: false,
  })

  render(<EmbeddingUnavailableNotice />)

  // 应显示通知 banner
  const notice = screen.getByRole('status')
  expect(notice).toBeDefined()

  // 应包含关键提示文案
  expect(notice.textContent).toContain('向量化功能不可用')
  expect(notice.textContent).toContain('sentence-transformers')
  expect(notice.textContent).toContain('pip install sentence-transformers')
  expect(notice.textContent).toContain('重启应用')
})

test('embedding 不可用通知包含 desktop 版本说明', () => {
  mockUseHealthCheck.mockReturnValue({
    health: { status: 'ok', embedding_available: false },
    isLoading: false,
  })

  render(<EmbeddingUnavailableNotice />)

  const notice = screen.getByRole('status')
  // 应提及桌面版
  expect(notice.textContent).toContain('桌面版')
})