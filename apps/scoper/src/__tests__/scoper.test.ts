import { describe, it, expect, vi } from 'vitest'

// Hoisted so every import of the module under test sees the same mocks.
const { MockWorker, connectDB, watchRedisErrors } = vi.hoisted(() => ({
  MockWorker: vi.fn(function MockWorker(this: Record<string, unknown>) {
    this.status = 'ready'
    this.on = vi.fn()
  }),
  connectDB: vi.fn().mockResolvedValue(undefined),
  watchRedisErrors: vi.fn()
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
vi.mock('../helpers/redisWatchdog.js', () => ({ watchRedisErrors }))
vi.mock('bullmq', () => ({ Job: vi.fn(), Worker: MockWorker }))

// Mocks are cleared before each test, so run the entry point inside the test
// to observe its startup side effects.
const startScoper = async () => {
  vi.resetModules()
  await import('../scoper.js')
}

describe('scoper entry point', () => {
  it('creates a BullMQ Worker bound to the scoper queue', async () => {
    await startScoper()
    expect(MockWorker).toHaveBeenCalledWith(
      'scoper',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    )
  })

  it('sets lockDuration on the worker options', async () => {
    await startScoper()
    expect(MockWorker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ lockDuration: 90000 })
    )
  })

  it('watches the worker for persistent Redis errors', async () => {
    await startScoper()
    expect(watchRedisErrors).toHaveBeenCalledWith(MockWorker.mock.instances[0])
  })

  it('calls connectDB on startup', async () => {
    await startScoper()
    expect(connectDB).toHaveBeenCalled()
  })
})
