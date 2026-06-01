import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job as BullMQJob } from 'bullmq'
import type { IJob } from '@bilbomd/mongodb-schema'

vi.mock('../../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../mongo-utils.js', () => ({
  updateStepStatus: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../nersc-api-functions.js', () => ({
  executeNerscScript: vi.fn().mockResolvedValue(undefined),
  submitJobToNersc: vi.fn().mockResolvedValue('submit-task-id'),
  monitorTaskAtNERSC: vi.fn()
}))

vi.mock('../prepare-results.js', () => ({
  prepareResults: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../job-utils.js', () => ({
  cleanupJob: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../config/config.js', () => ({
  config: {}
}))

const makeDBJob = (): IJob =>
  ({
    _id: 'job-id',
    uuid: 'test-uuid',
    steps: {},
    updateOne: vi.fn().mockResolvedValue(undefined)
  }) as unknown as IJob

const makeMQJob = (): BullMQJob =>
  ({
    log: vi.fn().mockResolvedValue(undefined)
  }) as unknown as BullMQJob

describe('submitBilboMDSlurm', () => {
  let submitBilboMDSlurm: typeof import('../bilbomd-step-functions-nersc.js').submitBilboMDSlurm
  let monitorTaskAtNERSC: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const nerscApi = await import('../nersc-api-functions.js')
    monitorTaskAtNERSC = vi.mocked(nerscApi.monitorTaskAtNERSC)
    const mod = await import('../bilbomd-step-functions-nersc.js')
    submitBilboMDSlurm = mod.submitBilboMDSlurm
  })

  it('persists the nersc sub-document to MongoDB after submission', async () => {
    monitorTaskAtNERSC.mockResolvedValue({
      result: JSON.stringify({ jobid: '12345678' })
    })

    const DBjob = makeDBJob()
    const MQjob = makeMQJob()

    const result = await submitBilboMDSlurm(MQjob, DBjob)

    expect(result).toBe('12345678')
    expect(DBjob.nersc).toEqual(
      expect.objectContaining({ jobid: '12345678', state: 'PENDING' })
    )
    expect(DBjob.updateOne).toHaveBeenCalledWith({
      $set: {
        nersc: expect.objectContaining({ jobid: '12345678', state: 'PENDING' })
      }
    })
  })

  it('throws and does not persist nersc when no job ID is returned', async () => {
    monitorTaskAtNERSC.mockResolvedValue({
      result: JSON.stringify({ jobid: '' })
    })

    const DBjob = makeDBJob()
    const MQjob = makeMQJob()

    await expect(submitBilboMDSlurm(MQjob, DBjob)).rejects.toThrow(
      /Failed to submit Slurm batch file/
    )
    expect(DBjob.updateOne).not.toHaveBeenCalled()
  })
})
