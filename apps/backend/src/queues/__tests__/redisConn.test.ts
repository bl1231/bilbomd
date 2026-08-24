import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

const hoisted = vi.hoisted(() => ({
  constructorCalls: [] as unknown[]
}))

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('events')
  class MockRedis extends EventEmitter {
    constructor(options: unknown) {
      super()
      hoisted.constructorCalls.push(options)
    }
  }
  return { Redis: MockRedis }
})

import { logger } from '../../middleware/loggers.js'
import { redis, redisRetryStrategy } from '../redisConn.js'

describe('redisConn', () => {
  it('configures ioredis with a retry strategy', () => {
    expect(hoisted.constructorCalls).toHaveLength(1)
    const options = hoisted.constructorCalls[0] as {
      retryStrategy: unknown
      maxRetriesPerRequest: unknown
    }
    expect(options.retryStrategy).toBe(redisRetryStrategy)
    expect(options.maxRetriesPerRequest).toBeNull()
  })

  it('retries with backoff capped at 5 seconds', () => {
    expect(redisRetryStrategy(1)).toBe(500)
    expect(redisRetryStrategy(5)).toBe(2500)
    expect(redisRetryStrategy(10)).toBe(5000)
    expect(redisRetryStrategy(1000)).toBe(5000)
  })

  it('logs connection errors instead of crashing the process', () => {
    expect(() =>
      (redis as unknown as EventEmitter).emit('error', new Error('connect ECONNREFUSED'))
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('connect ECONNREFUSED')
    )
  })
})
