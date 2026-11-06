import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { executionBackend: 'local' as string },
  fromId: vi.fn(),
  queueClose: vi.fn(async () => {}),
  queueNames: [] as string[],
  bilboMdHandler: vi.fn(),
  multiMdHandler: vi.fn(),
  connectDB: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  redisQuit: vi.fn(async () => 'OK'),
  writeFile: vi.fn(async () => {}),
  configureJobEvents: vi.fn(),
  flushJobEvents: vi.fn(async () => {}),
  calls: [] as string[]
}))

vi.mock('../config/config.js', () => ({ config: mocks.config }))
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))
vi.mock('../helpers/db.js', () => ({ connectDB: mocks.connectDB }))
vi.mock('../helpers/jobEvents.js', () => ({
  configureJobEvents: mocks.configureJobEvents,
  flushJobEvents: mocks.flushJobEvents
}))
vi.mock('../queues/redisConn.js', () => ({
  redis: { quit: mocks.redisQuit }
}))
vi.mock('mongoose', () => ({ default: { disconnect: mocks.disconnect } }))
vi.mock('node:fs/promises', () => ({ writeFile: mocks.writeFile }))
vi.mock('../workerHandlers/bilboMdHandler.js', () => ({
  bilboMdHandler: mocks.bilboMdHandler
}))
vi.mock('../workerHandlers/multiMdHandler.js', () => ({
  multiMdHandler: mocks.multiMdHandler
}))
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>()
  class Queue {
    constructor(name: string) {
      mocks.queueNames.push(name)
    }
    close = mocks.queueClose
  }
  return { ...actual, Queue, Job: { fromId: mocks.fromId } }
})

import { JobCancelledError } from '../helpers/jobCancellation.js'
import {
  EXIT_CODES,
  main,
  parseArgs,
  runJob,
  writeTerminationMessage
} from '../run-job.js'

const activeJob = (data: Record<string, unknown> = {}) => ({
  id: '42',
  finishedOn: undefined,
  data: { type: 'pdb', uuid: 'uuid-1', jobid: 'mongo-id', ...data }
})

const signal = () => new AbortController().signal

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.executionBackend = 'local'
  mocks.queueNames.length = 0
})

describe('parseArgs', () => {
  it('accepts a queue and a job id', () => {
    expect(parseArgs(['bilbomd', '42'])).toEqual({
      queueName: 'bilbomd',
      jobId: '42'
    })
    expect(parseArgs(['multimd', '7'])).toEqual({
      queueName: 'multimd',
      jobId: '7'
    })
  })

  it.each([[[]], [['bilbomd']], [['bilbomd', '42', 'extra']]])(
    'rejects %j',
    (argv) => {
      expect(() => parseArgs(argv)).toThrow(/Usage: run-job/)
    }
  )

  it('rejects queues it cannot run', () => {
    expect(() => parseArgs(['movie', '42'])).toThrow(/Unknown queue "movie"/)
    expect(() => parseArgs(['scoper', '42'])).toThrow(/Unknown queue/)
  })
})

describe('runJob', () => {
  it('runs a bilbomd job with the bilbomd handler', async () => {
    const job = activeJob()
    mocks.fromId.mockResolvedValueOnce(job)
    const abort = signal()

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, abort)

    expect(code).toBe(EXIT_CODES.OK)
    expect(mocks.queueNames).toEqual(['bilbomd'])
    expect(mocks.fromId).toHaveBeenCalledWith(expect.anything(), '42')
    expect(mocks.bilboMdHandler).toHaveBeenCalledWith(job, undefined, abort)
    expect(mocks.multiMdHandler).not.toHaveBeenCalled()
    expect(mocks.queueClose).toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('runs a multimd job with the multi handler', async () => {
    const job = activeJob({ type: 'multi' })
    mocks.fromId.mockResolvedValueOnce(job)

    const code = await runJob({ queueName: 'multimd', jobId: '7' }, signal())

    expect(code).toBe(EXIT_CODES.OK)
    expect(mocks.queueNames).toEqual(['multimd'])
    expect(mocks.multiMdHandler).toHaveBeenCalledWith(
      job,
      undefined,
      expect.any(AbortSignal)
    )
    expect(mocks.bilboMdHandler).not.toHaveBeenCalled()
  })

  it('refuses to run unless the backend is local', async () => {
    mocks.config.executionBackend = 'nersc'

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, signal())

    expect(code).toBe(EXIT_CODES.USAGE)
    expect(mocks.fromId).not.toHaveBeenCalled()
    expect(mocks.bilboMdHandler).not.toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/EXECUTION_BACKEND=local/)
    )
  })

  it('exits with a usage error when the BullMQ job is missing', async () => {
    mocks.fromId.mockResolvedValueOnce(undefined)

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, signal())

    expect(code).toBe(EXIT_CODES.USAGE)
    expect(mocks.bilboMdHandler).not.toHaveBeenCalled()
    expect(mocks.queueClose).toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'No BullMQ job 42 in the bilbomd queue'
    )
  })

  it('will not re-run a job BullMQ has already finished', async () => {
    mocks.fromId.mockResolvedValueOnce({ ...activeJob(), finishedOn: 1 })

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, signal())

    expect(code).toBe(EXIT_CODES.USAGE)
    expect(mocks.bilboMdHandler).not.toHaveBeenCalled()
  })

  it('exits 1 and records the reason when the pipeline fails', async () => {
    mocks.fromId.mockResolvedValueOnce(activeJob())
    mocks.bilboMdHandler.mockRejectedValueOnce(new Error('CHARMM exited 1'))

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, signal())

    expect(code).toBe(EXIT_CODES.FAILED)
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'CHARMM exited 1'
    )
    expect(mocks.queueClose).toHaveBeenCalled()
  })

  it('exits 3 when the job is cancelled', async () => {
    mocks.fromId.mockResolvedValueOnce(activeJob())
    mocks.bilboMdHandler.mockRejectedValueOnce(
      new JobCancelledError('Job cancelled: SIGTERM')
    )

    const code = await runJob({ queueName: 'bilbomd', jobId: '42' }, signal())

    expect(code).toBe(EXIT_CODES.CANCELLED)
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'Job cancelled: SIGTERM'
    )
  })
})

describe('writeTerminationMessage', () => {
  it('keeps the message within the Kubernetes limit', async () => {
    await writeTerminationMessage('x'.repeat(10_000))
    const written = (mocks.writeFile.mock.calls[0] as unknown[])[1] as string
    expect(written).toHaveLength(4000)
  })

  it('ignores a missing termination log (not on Kubernetes)', async () => {
    mocks.writeFile.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(writeTerminationMessage('boom')).resolves.toBeUndefined()
  })
})

describe('main', () => {
  it('publishes job events while the job runs and flushes them before exiting', async () => {
    mocks.fromId.mockResolvedValueOnce(activeJob())
    const order: string[] = []
    mocks.configureJobEvents.mockImplementation((publisher: unknown) =>
      order.push(publisher ? 'configure' : 'unconfigure')
    )
    mocks.bilboMdHandler.mockImplementationOnce(async () => {
      order.push('run')
    })
    mocks.flushJobEvents.mockImplementationOnce(async () => {
      order.push('flush')
    })
    mocks.redisQuit.mockImplementationOnce(async () => {
      order.push('quit')
      return 'OK'
    })

    await main(['bilbomd', '42'])

    expect(mocks.configureJobEvents).toHaveBeenNthCalledWith(1, {
      quit: mocks.redisQuit
    })
    expect(order).toEqual(['configure', 'run', 'flush', 'unconfigure', 'quit'])
  })

  it('exits as cancelled on SIGTERM while MongoDB is unreachable', async () => {
    mocks.connectDB.mockImplementationOnce(
      (signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
          process.emit('SIGTERM')
        })
    )

    const code = await main(['bilbomd', '42'])

    expect(code).toBe(EXIT_CODES.CANCELLED)
    expect(mocks.fromId).not.toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'Job cancelled before it started: SIGTERM'
    )
    expect(mocks.redisQuit).toHaveBeenCalled()
  })

  it('connects, runs the job and closes its connections', async () => {
    mocks.fromId.mockResolvedValueOnce(activeJob())

    const code = await main(['bilbomd', '42'])

    expect(code).toBe(EXIT_CODES.OK)
    expect(mocks.connectDB).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(mocks.bilboMdHandler).toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalled()
    expect(mocks.redisQuit).toHaveBeenCalled()
  })

  it('returns a usage error for bad arguments without connecting', async () => {
    const code = await main(['bilbomd'])

    expect(code).toBe(EXIT_CODES.USAGE)
    expect(mocks.connectDB).not.toHaveBeenCalled()
  })

  it('cancels the running job on SIGTERM', async () => {
    mocks.fromId.mockResolvedValueOnce(activeJob())
    let seen: AbortSignal | undefined
    mocks.bilboMdHandler.mockImplementationOnce(
      async (_job: unknown, _token: unknown, abort: AbortSignal) => {
        seen = abort
        process.emit('SIGTERM')
        if (abort.aborted) throw new JobCancelledError('Job cancelled: SIGTERM')
      }
    )

    const listenersBefore = process.listenerCount('SIGTERM')
    const code = await main(['bilbomd', '42'])

    expect(seen?.aborted).toBe(true)
    expect(seen?.reason).toBe('SIGTERM')
    expect(code).toBe(EXIT_CODES.CANCELLED)
    // The handler is removed once the job is done
    expect(process.listenerCount('SIGTERM')).toBe(listenersBefore)
  })

  it('reports a failure before the job starts (e.g. Redis down)', async () => {
    mocks.fromId.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

    const code = await main(['bilbomd', '42'])

    expect(code).toBe(EXIT_CODES.FAILED)
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'run-job: connect ECONNREFUSED'
    )
    expect(mocks.redisQuit).toHaveBeenCalled()
  })
})
