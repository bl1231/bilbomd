import { describe, it, expect, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => ({
  MockWorker: vi.fn(function MockWorker(this: Record<string, unknown>) {
    this.status = 'ready'
  })
}))

// dotenv is used as `import * as dotenv` then `dotenv.config()` — named export
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('../helpers/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../helpers/redis.js', () => ({ redis: {} }))
vi.mock('../process.bilbomdscoper.js', () => ({
  processBilboMDScoperJob: vi.fn()
}))
vi.mock('bullmq', () => ({ Job: vi.fn(), Worker: MockWorker }))

// Import at module level so side effects (connectDB, new Worker) run once
import '../scoper.js'
import { connectDB } from '../helpers/db.js'

describe('scoper entry point', () => {
  it('creates a BullMQ Worker bound to the scoper queue', () => {
    expect(MockWorker).toHaveBeenCalledWith(
      'scoper',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    )
  })

  it('sets lockDuration on the worker options', () => {
    expect(MockWorker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ lockDuration: 90000 })
    )
  })

  it('calls connectDB on startup', () => {
    expect(connectDB).toHaveBeenCalled()
  })
})
