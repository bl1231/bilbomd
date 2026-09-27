import { describe, it, expect, vi, afterEach } from 'vitest'
import { JOB_EVENTS_CHANNEL } from '@bilbomd/bilbomd-types'

vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import { configureJobEvents, notifyJobChanged } from '../helpers/jobEvents.js'
import { logger } from '../helpers/loggers.js'

afterEach(() => {
  configureJobEvents(null)
  vi.clearAllMocks()
})

describe('SCOPER job events', () => {
  it('publishes a job change on the job events channel', () => {
    const publish = vi.fn().mockResolvedValue(1)
    configureJobEvents({ publish })

    notifyJobChanged({ _id: 'scoper-job', user: { _id: 'owner-1' } })

    expect(publish).toHaveBeenCalledExactlyOnceWith(
      JOB_EVENTS_CHANNEL,
      JSON.stringify({
        jobId: 'scoper-job',
        ownerId: 'owner-1',
        kind: 'updated'
      })
    )
  })

  it('does nothing until configured', () => {
    expect(() => notifyJobChanged({ _id: 'scoper-job' })).not.toThrow()
  })

  it('logs publish failures instead of throwing', async () => {
    configureJobEvents({
      publish: vi.fn().mockRejectedValue(new Error('down'))
    })

    notifyJobChanged({ _id: 'scoper-job' })
    await new Promise((r) => setTimeout(r, 0))

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('down'))
  })
})
