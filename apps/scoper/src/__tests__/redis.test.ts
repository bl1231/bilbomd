import { describe, it, expect, vi, beforeEach } from 'vitest'

const { MockRedis } = vi.hoisted(() => ({
  // Must be a real constructor — Redis is used with `new`
  MockRedis: vi.fn(function MockRedis(this: Record<string, unknown>) {
    this.status = 'ready'
  })
}))

vi.mock('ioredis', () => ({ Redis: MockRedis }))

type RedisModule = typeof import('../helpers/redis.js')

describe('redis', () => {
  let redis: RedisModule['redis']

  // The Redis client is constructed as a module side effect. Vitest clears
  // mock call records before every test, so re-import the module per test to
  // observe the constructor call.
  beforeEach(async () => {
    vi.resetModules()
    ;({ redis } = await import('../helpers/redis.js'))
  })

  it('exports a Redis instance', () => {
    expect(redis).toBeDefined()
  })

  it('creates Redis with default port 6379 when REDIS_PORT is unset', () => {
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ port: 6379 })
    )
  })

  it('creates Redis with maxRetriesPerRequest set to null', () => {
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetriesPerRequest: null })
    )
  })

  it('creates Redis with default host localhost when REDIS_HOST is unset', () => {
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost' })
    )
  })
})
