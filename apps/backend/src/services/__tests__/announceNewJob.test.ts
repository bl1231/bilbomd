import { describe, it, expect, vi } from 'vitest'
import { JOB_EVENTS_CHANNEL } from '@bilbomd/bilbomd-types'

const { publishMock } = vi.hoisted(() => ({ publishMock: vi.fn() }))

vi.mock('../../queues/redisConn.js', () => ({
  redis: { publish: publishMock }
}))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { announceNewJob } from '../announceNewJob.js'

describe('announceNewJob', () => {
  it.each([
    ['an embedded owner (Job)', { _id: '64b1f0c2a9e4b1d2c3e4f5a1' }],
    ['an ObjectId-style ref (MultiJob)', '64b1f0c2a9e4b1d2c3e4f5a1']
  ])("publishes 'created' with the owner from %s", async (_, user) => {
    publishMock.mockResolvedValue(1)

    await announceNewJob({ _id: 'job-9', user })

    expect(publishMock).toHaveBeenCalledWith(
      JOB_EVENTS_CHANNEL,
      JSON.stringify({
        jobId: 'job-9',
        ownerId: '64b1f0c2a9e4b1d2c3e4f5a1',
        kind: 'created'
      })
    )
  })

  it('does not fail the submission when Redis is down', async () => {
    publishMock.mockRejectedValue(new Error('redis down'))

    await expect(announceNewJob({ _id: 'job-9' })).resolves.toBeUndefined()
  })
})
