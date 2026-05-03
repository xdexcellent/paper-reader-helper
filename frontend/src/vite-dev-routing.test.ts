// @vitest-environment node

import { describe, expect, test } from 'vitest'

import config from '../vite.config'

describe('vite dev routing', () => {
  test('does not proxy frontend routes that overlap SPA pages', () => {
    expect(config.server?.proxy).toBeUndefined()
  })
})
