import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerOptions } from 'bullmq'

vi.mock('bullmq', async () => {
  const { EventEmitter } = await import('node:events')
  class MockWorker extends EventEmitter {
    constructor(public name: string) {
      super()
    }
  }
  return { Worker: MockWorker }
})
vi.mock('../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../workerHandlers/bilboMdHandler.js', () => ({
  bilboMdHandler: vi.fn()
}))
vi.mock('../../workerHandlers/movieHandler.js', () => ({
  movieHandler: vi.fn()
}))
vi.mock('../../workerHandlers/multiMdHandler.js', () => ({
  multiMdHandler: vi.fn()
}))

import { createBilboMdWorker } from '../bilboMdWorker.js'
import { createMovieWorker } from '../movieWorker.js'
import { createMultiMDWorker } from '../multiMdWorker.js'
import { logger } from '../../helpers/loggers.js'

const options = {} as WorkerOptions

describe.each([
  ['BilboMD Worker', 'bilbomd', createBilboMdWorker],
  ['Movie Worker', 'movie', createMovieWorker],
  ['BilboMD Multi Worker', 'multimd', createMultiMDWorker]
])('%s', (label, queue, create) => {
  beforeEach(() => {
    vi.mocked(logger.warn).mockClear()
  })

  it(`consumes the ${queue} queue`, () => {
    expect((create(options) as unknown as { name: string }).name).toBe(queue)
  })

  it('logs Redis errors instead of letting BullMQ print raw stack traces', () => {
    const worker = create(options) as unknown as EventEmitter
    expect(() =>
      worker.emit('error', new Error('connect ECONNREFUSED'))
    ).not.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(
      `${label} error: connect ECONNREFUSED`
    )
  })
})
