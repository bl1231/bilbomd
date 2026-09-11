import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted so the same instances survive vi.resetModules() below — mock
// factories re-run on re-import, which would otherwise hand the entry point a
// different vi.fn() than the one we assert on.
const { MockWorker, connectDB } = vi.hoisted(() => ({
  MockWorker: vi.fn(function MockWorker(this: Record<string, unknown>) {
    this.status = 'ready'
  }),
  connectDB: vi.fn().mockResolvedValue(undefined)
}))

// dotenv is used as `import * as dotenv` then `dotenv.config()` — named export
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))
vi.mock('../helpers/db.js', () => ({ connectDB }))
vi.mock('../helpers/redis.js', () => ({ redis: {} }))
vi.mock('../process.bilbomdscoper.js', () => ({
  processBilboMDScoperJob: vi.fn()
}))
vi.mock('bullmq', () => ({ Job: vi.fn(), Worker: MockWorker }))

describe('scoper entry point', () => {
  // The entry point does its work (connectDB, new Worker) as module side
  // effects. Vitest clears mock call records before every test, so re-import
  // the module per test to observe those calls.
  beforeEach(async () => {
    vi.resetModules()
    await import('../scoper.js')
  })

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
