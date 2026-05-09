// @vitest-environment jsdom

// useHealthCheck hook 测试
// 覆盖桌面启动时后端健康检查轮询逻辑

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'

// Mock api.ts 的 checkHealth 函数
const mockCheckHealth = vi.fn()
vi.mock('../lib/api', () => ({
  checkHealth: () => mockCheckHealth(),
}))

import { useHealthCheck } from './useHealthCheck'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('初始状态为 loading，调用 checkHealth', () => {
  // checkHealth 永远不 resolved，保持在 loading
  mockCheckHealth.mockReturnValue(new Promise(() => {}))

  const { result } = renderHook(() => useHealthCheck())

  // 初始状态应该是 loading
  expect(result.current.isLoading).toBe(true)
  expect(result.current.health).toBe(null)
  expect(mockCheckHealth).toHaveBeenCalledTimes(1)
})

test('checkHealth 成功时返回健康状态', async () => {
  mockCheckHealth.mockResolvedValueOnce({
    status: 'ok',
    embedding_available: true,
  })

  const { result } = renderHook(() => useHealthCheck())

  await waitFor(() => {
    expect(result.current.isLoading).toBe(false)
  })

  expect(result.current.health).toEqual({
    status: 'ok',
    embedding_available: true,
  })
})

test('checkHealth 返回 embedding 不可用时仍为成功状态', async () => {
  mockCheckHealth.mockResolvedValueOnce({
    status: 'ok',
    embedding_available: false,
  })

  const { result } = renderHook(() => useHealthCheck())

  await waitFor(() => {
    expect(result.current.isLoading).toBe(false)
  })

  expect(result.current.health).toEqual({
    status: 'ok',
    embedding_available: false,
  })
})

test('checkHealth 失败时 health 为 null（桌面启动时后端可能未就绪）', async () => {
  mockCheckHealth.mockRejectedValueOnce(new Error('Network error'))

  const { result } = renderHook(() => useHealthCheck())

  await waitFor(() => {
    expect(result.current.isLoading).toBe(false)
  })

  // 后端未就绪时，health 为 null，组件应根据此判断显示加载状态
  expect(result.current.health).toBe(null)
})