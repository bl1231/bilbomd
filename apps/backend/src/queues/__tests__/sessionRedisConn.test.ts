import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn()
}))

vi.mock('redis', async () => {
  const { EventEmitter } = await import('events')
  return {
    createClient: (config: unknown) => {
      createClientMock(config)
      return new EventEmitter()
    }
  }
})

import { logger } from '../../middleware/loggers.js'
import { sessionRedis, sessionRedisReconnectStrategy } from '../sessionRedisConn.js'

describe('sessionRedisConn', () => {
  it('configures the client with a reconnect strategy', () => {
    expect(createClientMock).toHaveBeenCalledTimes(1)
    const config = createClientMock.mock.calls[0][0] as {
      socket: { reconnectStrategy: unknown }
    }
    expect(config.socket.reconnectStrategy).toBe(sessionRedisReconnectStrategy)
  })

  it('retries with backoff capped at 5 seconds', () => {
    expect(sessionRedisReconnectStrategy(1)).toBe(500)
    expect(sessionRedisReconnectStrategy(5)).toBe(2500)
    expect(sessionRedisReconnectStrategy(10)).toBe(5000)
    expect(sessionRedisReconnectStrategy(1000)).toBe(5000)
  })

  it('logs connection errors instead of crashing the process', () => {
    expect(() =>
      (sessionRedis as unknown as EventEmitter).emit(
        'error',
        new Error('connect ECONNREFUSED')
      )
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('connect ECONNREFUSED')
    )
  })

  it('logs reconnect attempts', () => {
    ;(sessionRedis as unknown as EventEmitter).emit('reconnecting')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('reconnecting')
    )
  })
})
