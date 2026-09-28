import { describe, it, expect, vi } from 'vitest'

const { MockRedis } = vi.hoisted(() => ({
  // Must be a real constructor — Redis is used with `new`
  MockRedis: vi.fn(function MockRedis(this: Record<string, unknown>) {
    this.status = 'ready'
  })
}))

vi.mock('ioredis', () => ({ Redis: MockRedis }))

import { redis } from '../redisConn.js'

// Mocks are cleared before each test, so load the module inside the test to
// observe the connection it creates at import time.
const importFresh = async () => {
  vi.resetModules()
  return import('../redisConn.js')
}

describe('redisConn', () => {
  it('exports a Redis instance', () => {
    expect(redis).toBeDefined()
  })

  it('sends no password when REDIS_PASSWORD is unset', async () => {
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({
        password: undefined,
        maxRetriesPerRequest: null
      })
    )
  })

  it('passes REDIS_PASSWORD to ioredis', async () => {
    vi.stubEnv('REDIS_PASSWORD', 's3cret')
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ password: 's3cret' })
    )
    vi.unstubAllEnvs()
  })
})
