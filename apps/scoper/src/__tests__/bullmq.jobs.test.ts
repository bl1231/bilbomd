import { describe, it, expect } from 'vitest'
import type { BilboMDScoperJobData } from '../bullmq.jobs.js'

describe('BilboMDScoperJobData', () => {
  it('accepts a conforming object', () => {
    const job: BilboMDScoperJobData = {
      title: 'test-job',
      uuid: 'bf899e0d-febc-4fe7-87c0-bc2ca73ac07e',
      jobid: '64a1b2c3d4e5f6a7b8c9d0e1'
    }
    expect(job.title).toBe('test-job')
    expect(job.uuid).toBe('bf899e0d-febc-4fe7-87c0-bc2ca73ac07e')
    expect(job.jobid).toBe('64a1b2c3d4e5f6a7b8c9d0e1')
  })
})
