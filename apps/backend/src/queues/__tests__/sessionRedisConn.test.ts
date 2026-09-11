import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Hoisted so the same instances survive vi.resetModules() below — mock
// factories re-run on re-import, which would otherwise hand the module under
// test different vi.fn()s than the ones we assert on.
const { createClientMock, logger } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../../middleware/loggers.js', () => ({ logger }))

vi.mock('redis', async () => {
  const { EventEmitter } = await import('events')
  return {
    createClient: (config: unknown) => {
      createClientMock(config)
      return new EventEmitter()
    }
  }
})

type SessionRedisModule = typeof import('../sessionRedisConn.js')

describe('sessionRedisConn', () => {
  let sessionRedis: SessionRedisModule['sessionRedis']
  let sessionRedisReconnectStrategy: SessionRedisModule['sessionRedisReconnectStrategy']

  // The client is created as a module side effect. Vitest clears mock call
  // records before every test, so re-import the module per test to observe
  // the createClient call.
  beforeEach(async () => {
    vi.resetModules()
    ;({ sessionRedis, sessionRedisReconnectStrategy } =
      await import('../sessionRedisConn.js'))
  })

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
