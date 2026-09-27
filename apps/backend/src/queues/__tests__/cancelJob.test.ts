import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Queue } from 'bullmq'
import { JOB_CANCEL_CHANNEL } from '@bilbomd/bilbomd-types'

// The real queue modules connect to Redis on import
vi.mock('../bilbomd.js', () => ({ bilbomdQueue: {} }))
vi.mock('../multimd.js', () => ({ multimdQueue: {} }))
vi.mock('../scoper.js', () => ({ scoperQueue: {} }))
vi.mock('../redisConn.js', () => ({ redis: {} }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { requestJobCancellation } from '../cancelJob.js'

const makeBullJob = (id: string, jobid?: string) => ({
  id,
  data: jobid ? { jobid } : {},
  remove: vi.fn().mockResolvedValue(undefined)
})

const makeQueue = (name: string, jobs: ReturnType<typeof makeBullJob>[]) =>
  ({
    name,
    getJobs: vi.fn().mockResolvedValue(jobs)
  }) as unknown as Queue & { getJobs: ReturnType<typeof vi.fn> }

describe('requestJobCancellation', () => {
  const makePublisher = () => ({
    publish: vi
      .fn<(channel: string, message: string) => Promise<number>>()
      .mockResolvedValue(1)
  })
  let publisher: ReturnType<typeof makePublisher>

  beforeEach(() => {
    publisher = makePublisher()
  })

  it('removes queued entries for the job from every queue', async () => {
    const target1 = makeBullJob('1', 'mongo-1')
    const other = makeBullJob('2', 'mongo-2')
    const target2 = makeBullJob('3', 'mongo-1')
    const noData = makeBullJob('4')
    const bilbomd = makeQueue('bilbomd', [target1, other])
    const multimd = makeQueue('multimd', [target2, noData])

    const removed = await requestJobCancellation('mongo-1', 'deleted', {
      queues: [bilbomd, multimd],
      publisher
    })

    expect(removed).toBe(2)
    expect(target1.remove).toHaveBeenCalled()
    expect(target2.remove).toHaveBeenCalled()
    expect(other.remove).not.toHaveBeenCalled()
    expect(bilbomd.getJobs).toHaveBeenCalledWith([
      'waiting',
      'delayed',
      'prioritized',
      'waiting-children'
    ])
  })

  it('never touches active jobs (those are cancelled via the workers)', async () => {
    const bilbomd = makeQueue('bilbomd', [])

    await requestJobCancellation('mongo-1', 'deleted', {
      queues: [bilbomd],
      publisher
    })

    expect(bilbomd.getJobs.mock.calls[0][0]).not.toContain('active')
  })

  it('publishes a cancel message for workers running the job', async () => {
    await requestJobCancellation('mongo-1', 'job deleted by user', {
      queues: [makeQueue('bilbomd', [])],
      publisher
    })

    expect(publisher.publish).toHaveBeenCalledWith(
      JOB_CANCEL_CHANNEL,
      JSON.stringify({ jobid: 'mongo-1', reason: 'job deleted by user' })
    )
  })

  it('tolerates null entries returned by getJobs', async () => {
    const queue = makeQueue('bilbomd', [
      null as unknown as ReturnType<typeof makeBullJob>
    ])

    await expect(
      requestJobCancellation('mongo-1', 'deleted', {
        queues: [queue],
        publisher
      })
    ).resolves.toBe(0)
  })
})
