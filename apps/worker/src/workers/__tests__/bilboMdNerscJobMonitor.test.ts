import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { IJob, INerscInfo, NerscStatus } from '@bilbomd/mongodb-schema'
import { queryNERSCForJobState } from '../bilboMdNerscJobMonitor.js'
import { updateSingleJobStep } from '../../services/functions/job-monitor-functions.js'

vi.mock('../../helpers/loggers.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: vi.fn(() => false)
  }
}))

vi.mock('../../services/functions/nersc-api-token-functions.js', () => ({
  ensureValidToken: vi.fn().mockResolvedValue('a-valid-token')
}))

vi.mock('../../services/functions/nersc-api-functions.js', () => ({
  getSlurmStatusFile: vi.fn()
}))

vi.mock('../../services/functions/job-monitor-functions.js', () => ({
  copyBilboMDResults: vi.fn(),
  prepareBilboMDResults: vi.fn(),
  sendBilboMDEmail: vi.fn(),
  updateSingleJobStep: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../services/functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(),
  buildContext: vi.fn()
}))

vi.mock('@bilbomd/md-utils', () => ({
  discriminatorToPipeline: vi.fn()
}))

const makeJob = (nersc?: Partial<INerscInfo> | null): IJob =>
  ({
    uuid: 'test-uuid',
    status: 'Running',
    steps: {},
    nersc:
      nersc === null
        ? undefined
        : {
            jobid: '12345678',
            state: NerscStatus.PENDING,
            qos: 'regular',
            time_submitted: new Date(),
            ...nersc
          },
    save: vi.fn().mockResolvedValue(undefined)
  }) as unknown as IJob

const mockApiResponse = (output: unknown[]) => {
  vi.mocked(axios.get).mockResolvedValue({ data: { output } })
}

describe('queryNERSCForJobState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the parsed state when the API has accounting data', async () => {
    mockApiResponse([
      {
        state: 'RUNNING',
        qos: 'regular',
        submit: '2026-08-24T10:00:00',
        start: '2026-08-24T10:05:00',
        end: 'Unknown'
      }
    ])
    const job = makeJob()

    const result = await queryNERSCForJobState(job)

    expect(result).not.toBeNull()
    expect(result?.state).toBe(NerscStatus.RUNNING)
    expect(result?.jobid).toBe('12345678')
    expect(updateSingleJobStep).not.toHaveBeenCalled()
  })

  it('reports a benign Waiting step when accounting is empty and stored state is PENDING', async () => {
    mockApiResponse([])
    const job = makeJob({ state: NerscStatus.PENDING })

    const result = await queryNERSCForJobState(job)

    expect(result).toBeNull()
    expect(updateSingleJobStep).toHaveBeenCalledExactlyOnceWith(
      job,
      'nersc_job_status',
      'Waiting',
      'Waiting for job to appear in Slurm accounting...'
    )
  })

  it('reports an Error step when accounting is empty and stored state is not PENDING', async () => {
    mockApiResponse([])
    const job = makeJob({ state: NerscStatus.RUNNING })

    const result = await queryNERSCForJobState(job)

    expect(result).toBeNull()
    expect(updateSingleJobStep).toHaveBeenCalledExactlyOnceWith(
      job,
      'nersc_job_status',
      'Error',
      'Failed to fetch NERSC job state.'
    )
  })

  it('reports an Error step when the job has no NERSC jobid', async () => {
    const job = makeJob(null)

    const result = await queryNERSCForJobState(job)

    expect(result).toBeNull()
    expect(axios.get).not.toHaveBeenCalled()
    expect(updateSingleJobStep).toHaveBeenCalledExactlyOnceWith(
      job,
      'nersc_job_status',
      'Error',
      'Failed to fetch NERSC job state.'
    )
  })

  it('marks the job as Error when the API request throws', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('network down'))
    const job = makeJob()

    const result = await queryNERSCForJobState(job)

    expect(result).toBeNull()
    expect(updateSingleJobStep).toHaveBeenCalledExactlyOnceWith(
      job,
      'nersc_job_status',
      'Error',
      'Error: network down'
    )
    expect(job.status).toBe('Error')
    expect(job.save).toHaveBeenCalled()
  })
})
