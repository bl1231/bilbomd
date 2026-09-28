import { describe, it, expect, vi } from 'vitest'

const { MockRedis } = vi.hoisted(() => ({
  // Must be a real constructor — Redis is used with `new`
  MockRedis: vi.fn(function MockRedis(this: Record<string, unknown>) {
    this.status = 'ready'
  })
}))

vi.mock('ioredis', () => ({ Redis: MockRedis }))

import { redis } from '../helpers/redis.js'

// Mocks are cleared before each test, so load the module inside the test to
// observe the connection it creates at import time.
const importFresh = async () => {
  vi.resetModules()
  return import('../helpers/redis.js')
}

describe('redis', () => {
  it('exports a Redis instance', () => {
    expect(redis).toBeDefined()
  })

  it('creates Redis with default port 6379 when REDIS_PORT is unset', async () => {
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ port: 6379 })
    )
  })

  it('creates Redis with maxRetriesPerRequest set to null', async () => {
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetriesPerRequest: null })
    )
  })

  it('creates Redis with default host localhost when REDIS_HOST is unset', async () => {
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost' })
    )
  })

  it('sends no password when REDIS_PASSWORD is unset', async () => {
    await importFresh()
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ password: undefined })
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
