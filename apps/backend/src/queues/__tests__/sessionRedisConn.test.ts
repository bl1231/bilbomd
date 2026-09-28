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

// Mocks are cleared before each test, so load the module inside the test to
// observe the client it creates at import time.
const importFresh = async () => {
  vi.resetModules()
  const mod = await import('../sessionRedisConn.js')
  return { mod, config: createClientMock.mock.calls[0]?.[0] }
}

describe('sessionRedisConn', () => {
  it('configures the client with a reconnect strategy', async () => {
    const { mod, config } = await importFresh()
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(config.socket.reconnectStrategy).toBe(
      mod.sessionRedisReconnectStrategy
    )
  })

  it('sends no password when REDIS_PASSWORD is unset', async () => {
    const { config } = await importFresh()
    expect(config).toMatchObject({ password: undefined })
  })

  it('passes REDIS_PASSWORD to the client', async () => {
    vi.stubEnv('REDIS_PASSWORD', 's3cret')
    const { config } = await importFresh()
    expect(config).toMatchObject({ password: 's3cret' })
    vi.unstubAllEnvs()
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
