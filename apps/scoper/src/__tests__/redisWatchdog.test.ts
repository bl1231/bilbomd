import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import {
  createRedisWatchdog,
  watchRedisErrors
} from '../helpers/redisWatchdog.js'
import { logger } from '../helpers/loggers.js'

const refused = new Error('connect ECONNREFUSED redis.example:6379')

const setup = (opts: { timeoutMs?: number; quietMs?: number } = {}) => {
  let t = 0
  const onGiveUp = vi.fn()
  const watchdog = createRedisWatchdog({
    timeoutMs: 120_000,
    quietMs: 60_000,
    ...opts,
    onGiveUp,
    now: () => t
  })
  const errorAt = (ms: number) => {
    t = ms
    watchdog.recordError(refused)
  }
  return { onGiveUp, errorAt }
}

describe('createRedisWatchdog', () => {
  it('gives up when errors persist past the timeout', () => {
    const { onGiveUp, errorAt } = setup()
    for (let ms = 0; ms < 120_000; ms += 20_000) errorAt(ms)
    expect(onGiveUp).not.toHaveBeenCalled()
    errorAt(120_000)
    expect(onGiveUp).toHaveBeenCalledOnce()
    expect(onGiveUp.mock.calls[0][0]).toContain('120s')
    expect(onGiveUp.mock.calls[0][0]).toContain('ECONNREFUSED')
  })

  it('tolerates a short outage', () => {
    const { onGiveUp, errorAt } = setup()
    for (let ms = 0; ms <= 40_000; ms += 20_000) errorAt(ms)
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  it('starts a new streak after a quiet gap', () => {
    const { onGiveUp, errorAt } = setup()
    errorAt(0)
    errorAt(50_000)
    // 70s without errors: Redis recovered, the old streak is over
    errorAt(120_001)
    errorAt(180_000)
    errorAt(230_000)
    expect(onGiveUp).not.toHaveBeenCalled()
    errorAt(240_001)
    expect(onGiveUp).toHaveBeenCalledOnce()
  })

  it('gives up only once', () => {
    const { onGiveUp, errorAt } = setup({ timeoutMs: 10_000 })
    errorAt(0)
    errorAt(10_000)
    errorAt(15_000)
    expect(onGiveUp).toHaveBeenCalledOnce()
  })
})

describe('watchRedisErrors', () => {
  it('logs worker errors and feeds them to the watchdog', () => {
    const worker = new EventEmitter()
    let t = 0
    const onGiveUp = vi.fn()
    watchRedisErrors(worker, { timeoutMs: 1_000, onGiveUp, now: () => t })

    worker.emit('error', refused)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED')
    )
    t = 1_000
    worker.emit('error', refused)
    expect(onGiveUp).toHaveBeenCalledOnce()
  })

  describe('default onGiveUp', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never)
    })

    afterEach(() => {
      exitSpy.mockRestore()
    })

    it('logs and exits with code 1', () => {
      const worker = new EventEmitter()
      let t = 0
      watchRedisErrors(worker, { timeoutMs: 1_000, now: () => t })
      worker.emit('error', refused)
      t = 1_000
      worker.emit('error', refused)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Exiting so the container restarts')
      )
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
