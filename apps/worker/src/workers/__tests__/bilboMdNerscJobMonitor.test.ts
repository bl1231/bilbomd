import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { IJob, INerscInfo, Job, NerscStatus } from '@bilbomd/mongodb-schema'
import {
  calculateProgress,
  monitorAndCleanupJobs,
  parseSlurmTime,
  parseStatusLine,
  queryNERSCForJobState
} from '../bilboMdNerscJobMonitor.js'
import { configureJobEvents } from '../../helpers/jobEvents.js'
import {
  copyBilboMDResults,
  updateSingleJobStep
} from '../../services/functions/job-monitor-functions.js'
import { getSlurmStatusFile } from '../../services/functions/nersc-api-functions.js'
import { prepareBilboMDResults } from '../../services/functions/prepare-results.js'
import {
  storeNerscMdConstraints,
  storeNerscMdConstraintsMidRun
} from '../../services/functions/nersc-md-constraints.js'
import { recordWorkerUsageEvent } from '../../services/functions/usage-events.js'
import { sendJobFailedEmail } from '../../services/functions/job-failure.js'

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
  sendBilboMDEmail: vi.fn(),
  updateSingleJobStep: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../services/functions/prepare-results.js', () => ({
  prepareBilboMDResults: vi.fn()
}))

vi.mock('../../services/functions/nersc-md-constraints.js', () => ({
  storeNerscMdConstraints: vi.fn(),
  storeNerscMdConstraintsMidRun: vi.fn()
}))

vi.mock('../../services/functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(),
  buildContext: vi.fn()
}))

vi.mock('../../services/functions/job-failure.js', () => ({
  sendJobFailedEmail: vi.fn()
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
    // sacct times are Pacific wall-clock time (PDT in August)
    expect(result?.time_started.toISOString()).toBe('2026-08-24T17:05:00.000Z')
    expect(result?.time_completed.getTime()).toBe(0)
    expect(updateSingleJobStep).not.toHaveBeenCalled()
  })

  it('queries sacct from Slurm directly, not the SF API cache', async () => {
    mockApiResponse([{ state: 'RUNNING' }])

    await queryNERSCForJobState(makeJob())

    const url = new URL(vi.mocked(axios.get).mock.calls[0][0])
    expect(url.pathname).toMatch(/\/compute\/jobs\/perlmutter\/12345678$/)
    expect(url.searchParams.get('sacct')).toBe('true')
    expect(url.searchParams.get('cached')).toBe('false')
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

describe('monitorAndCleanupJobs', () => {
  const findReturning = (jobs: IJob[]) => {
    vi.spyOn(Job, 'find').mockReturnValue({
      exec: vi.fn().mockResolvedValue(jobs)
    } as unknown as ReturnType<typeof Job.find>)
  }

  const publish = vi.fn().mockResolvedValue(1)
  const publishedJobIds = () =>
    publish.mock.calls.map(([, message]) => JSON.parse(message).jobId)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    configureJobEvents({ publish })
  })

  afterEach(() => {
    configureJobEvents(null)
  })

  it('tells the UI about a job whose state changed during the pass', async () => {
    // NERSC query fails, so the job is synced from its stored state; a
    // RUNNING nersc.state turns a Pending job Running
    const job = makeJob({ jobid: '', state: NerscStatus.RUNNING })
    job.status = 'Pending'
    Object.assign(job, { _id: 'nersc-job-1' })
    findReturning([job])

    await monitorAndCleanupJobs()

    expect(job.status).toBe('Running')
    expect(publishedJobIds()).toEqual(['nersc-job-1'])
  })

  it('stays quiet for jobs the pass left unchanged', async () => {
    const job = makeJob({ jobid: '', state: NerscStatus.RUNNING })
    findReturning([job])

    await monitorAndCleanupJobs()

    expect(publish).not.toHaveBeenCalled()
  })
})

// Real Mongoose documents, not plain objects: job.steps is a subdocument, and
// Object.values() on it returns Mongoose internals rather than the steps
const makeRealJob = () => {
  const job = new Job({
    uuid: 'real-uuid',
    status: 'Running',
    steps: {
      pae: { status: 'Running', message: 'Running' },
      minimize: { status: 'Waiting', message: 'Waiting' },
      md: { status: 'Waiting', message: 'Waiting' },
      foxs: { status: 'Waiting', message: 'Waiting' }
    },
    nersc: {
      jobid: '12345678',
      state: NerscStatus.RUNNING,
      qos: 'gpu_debug',
      time_submitted: new Date()
    }
  })
  vi.spyOn(job, 'save').mockResolvedValue(job)
  return job as unknown as IJob
}

describe('calculateProgress', () => {
  it('counts the Success steps of a Mongoose job', async () => {
    const job = makeRealJob()
    job.steps!.pae = { status: 'Success', message: 'Success' }

    expect(await calculateProgress(job.steps)).toBe(25)
  })

  it('returns 0 when the job has no steps', async () => {
    expect(await calculateProgress(undefined)).toBe(0)
  })
})

describe('monitorAndCleanupJobs progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('updates steps and progress from status.txt while the job runs', async () => {
    const job = makeRealJob()
    vi.spyOn(Job, 'find').mockReturnValue({
      exec: vi.fn().mockResolvedValue([job])
    } as unknown as ReturnType<typeof Job.find>)
    mockApiResponse([{ state: 'RUNNING', qos: 'gpu_debug' }])
    vi.mocked(getSlurmStatusFile).mockResolvedValue(
      'pae: Success\nminimize: Success\nmd: Running\nfoxs: Waiting\n'
    )

    await monitorAndCleanupJobs()

    expect(job.steps?.pae?.status).toBe('Success')
    expect(job.steps?.minimize?.status).toBe('Success')
    expect(job.steps?.md?.status).toBe('Running')
    expect(job.progress).toBe(50)
  })

  it('copies the step times the Slurm script recorded in status.txt', async () => {
    const job = makeRealJob()
    vi.spyOn(Job, 'find').mockReturnValue({
      exec: vi.fn().mockResolvedValue([job])
    } as unknown as ReturnType<typeof Job.find>)
    mockApiResponse([{ state: 'RUNNING', qos: 'gpu_debug' }])
    vi.mocked(getSlurmStatusFile).mockResolvedValue(
      'pae: Success 1759712700 1759712745\nminimize: Running 1759712749\nmd: Waiting\n'
    )

    await monitorAndCleanupJobs()

    expect(job.steps?.pae?.started_at).toEqual(new Date(1759712700_000))
    expect(job.steps?.pae?.completed_at).toEqual(new Date(1759712745_000))
    expect(job.steps?.pae?.duration_ms).toBe(45_000)
    expect(job.steps?.minimize?.started_at).toEqual(new Date(1759712749_000))
    expect(job.steps?.minimize?.completed_at).toBeUndefined()
    expect(job.steps?.md?.started_at).toBeUndefined()
  })

  it('times the Slurm job step from accounting, not from the poll', async () => {
    const job = makeRealJob()
    vi.spyOn(Job, 'find').mockReturnValue({
      exec: vi.fn().mockResolvedValue([job])
    } as unknown as ReturnType<typeof Job.find>)
    mockApiResponse([
      {
        state: 'RUNNING',
        qos: 'gpu_debug',
        start: '2026-10-06T01:05:49',
        end: 'Unknown'
      }
    ])
    vi.mocked(getSlurmStatusFile).mockResolvedValue('')

    await monitorAndCleanupJobs()

    const [, , , , timing] = vi
      .mocked(updateSingleJobStep)
      .mock.calls.find(([, step]) => step === 'nersc_job_status')!
    expect(timing).toEqual({
      started_at: parseSlurmTime('2026-10-06T01:05:49')
    })
  })
})

describe('parseStatusLine', () => {
  it('reads a line written before the times were added', () => {
    expect(parseStatusLine('minimize: Success')).toEqual({
      step: 'minimize',
      status: { status: 'Success', message: 'Success' }
    })
  })

  it('reads the start of a running step', () => {
    expect(parseStatusLine('md: Running 1759712749')?.status).toEqual({
      status: 'Running',
      message: 'Running',
      started_at: new Date(1759712749_000)
    })
  })

  it('reads both times and the duration of a finished step', () => {
    expect(
      parseStatusLine('heat: Error 1759712749 1759712832')?.status
    ).toEqual({
      status: 'Error',
      message: 'Error',
      started_at: new Date(1759712749_000),
      completed_at: new Date(1759712832_000),
      duration_ms: 83_000
    })
  })

  it('returns null for a line with no step', () => {
    expect(parseStatusLine('garbage')).toBeNull()
  })
})

describe('parseSlurmTime', () => {
  // Issue #1076: read as UTC, start times landed 7 hours early, so queue
  // times went negative ('Invalid') and run times were 7 hours too long
  it('reads sacct times as Perlmutter (Pacific) local time', () => {
    expect(parseSlurmTime('2026-09-28T22:22:05').toISOString()).toBe(
      '2026-09-29T05:22:05.000Z'
    )
  })

  it('follows daylight saving time', () => {
    expect(parseSlurmTime('2026-12-01T09:00:00').toISOString()).toBe(
      '2026-12-01T17:00:00.000Z'
    )
  })

  it('keeps an explicit offset', () => {
    expect(parseSlurmTime('2026-09-28T22:22:05Z').toISOString()).toBe(
      '2026-09-28T22:22:05.000Z'
    )
  })

  it.each(['Unknown', 'N/A', 'None', '', undefined])(
    'returns the epoch placeholder for %j',
    (value) => {
      expect(parseSlurmTime(value).getTime()).toBe(0)
    }
  )
})

describe('monitorAndCleanupJobs usage events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  const runPass = async (
    status: IJob['status'],
    slurmState: string,
    statusFile = ''
  ) => {
    const job = makeRealJob()
    job.status = status
    vi.spyOn(Job, 'find').mockReturnValue({
      exec: vi.fn().mockResolvedValue([job])
    } as unknown as ReturnType<typeof Job.find>)
    mockApiResponse([{ state: slurmState, qos: 'gpu_debug' }])
    vi.mocked(getSlurmStatusFile).mockResolvedValue(statusFile)
    await monitorAndCleanupJobs()
    return job
  }

  const recordedEvents = () =>
    vi.mocked(recordWorkerUsageEvent).mock.calls.map(([e]) => e.eventType)

  it('records job_failed and emails the owner when a job fails', async () => {
    const job = await runPass('Running', 'FAILED')

    expect(recordedEvents()).toEqual(['job_failed'])
    expect(sendJobFailedEmail).toHaveBeenCalledExactlyOnceWith(job)
    expect(job.status).toBe('Failed')
  })

  it('does not report an already-failed job again', async () => {
    await runPass('Failed', 'FAILED')

    expect(recordedEvents()).toEqual([])
    expect(sendJobFailedEmail).not.toHaveBeenCalled()
  })

  it('records job_cancelled only when the job becomes Cancelled', async () => {
    await runPass('Running', 'CANCELLED')
    expect(recordedEvents()).toEqual(['job_cancelled'])

    vi.mocked(recordWorkerUsageEvent).mockClear()
    await runPass('Cancelled', 'CANCELLED')
    expect(recordedEvents()).toEqual([])
  })

  // A Slurm script that scancels itself after a failed step shows up as
  // CANCELLED, with the failed step marked Error in status.txt
  it('reports a self-cancelled job with a failed step as Failed', async () => {
    const job = await runPass(
      'Running',
      'CANCELLED by 62704',
      'minimize: Error\nmd: Waiting\n'
    )

    expect(recordedEvents()).toEqual(['job_failed'])
    expect(sendJobFailedEmail).toHaveBeenCalledExactlyOnceWith(job)
    expect(job.status).toBe('Failed')
  })

  it('keeps a cancelled job with no failed step as Cancelled', async () => {
    const job = await runPass(
      'Running',
      'CANCELLED by 62704',
      'minimize: Success\nmd: Running\n'
    )

    expect(recordedEvents()).toEqual(['job_cancelled'])
    expect(sendJobFailedEmail).not.toHaveBeenCalled()
    expect(job.status).toBe('Cancelled')
  })

  it('offers a running job the raw status.txt steps so its constraints can be recorded mid-run', async () => {
    const job = await runPass(
      'Running',
      'RUNNING',
      'pae: Success 1 2\npae2constraints: Success 1 2\nconsmerge: Success 2 3\nminimize: Running 3\n'
    )

    // consmerge is a Slurm-only step: not on the job document, but passed on
    expect(storeNerscMdConstraintsMidRun).toHaveBeenCalledExactlyOnceWith(job, {
      pae: 'Success',
      pae2constraints: 'Success',
      consmerge: 'Success',
      minimize: 'Running'
    })
    expect(job.steps).not.toHaveProperty('consmerge')
  })

  it('does not try the mid-run read when status.txt is unavailable or the job is not running', async () => {
    // runPass resolves the status file; a queued rejection wins over it
    vi.mocked(getSlurmStatusFile).mockRejectedValueOnce(new Error('no file'))
    await runPass('Running', 'RUNNING')
    expect(storeNerscMdConstraintsMidRun).not.toHaveBeenCalled()

    await runPass('Running', 'COMPLETED', 'minimize: Success\n')
    expect(storeNerscMdConstraintsMidRun).not.toHaveBeenCalled()
  })

  it('records the MD constraints from CFS after the copy back and before preparing results', async () => {
    const order: string[] = []
    vi.mocked(copyBilboMDResults).mockImplementation(async () => {
      order.push('copy')
    })
    vi.mocked(storeNerscMdConstraints).mockImplementation(async () => {
      order.push('constraints')
    })
    vi.mocked(prepareBilboMDResults).mockImplementation(async () => {
      order.push('results')
    })

    const job = await runPass('Running', 'COMPLETED')

    expect(storeNerscMdConstraints).toHaveBeenCalledExactlyOnceWith(job)
    expect(order).toEqual(['copy', 'constraints', 'results'])
    expect(job.status).toBe('Completed')
  })

  it('stops polling jobs that are Completed, Failed or Cancelled', async () => {
    await runPass('Running', 'RUNNING')

    const monitorQuery = vi
      .mocked(Job.find)
      .mock.calls.map(([filter]) => filter as Record<string, unknown>)
      .find((filter) => 'nersc.state' in filter)
    expect(monitorQuery?.status).toEqual({
      $nin: ['Completed', 'Failed', 'Cancelled']
    })
  })

  it('records job_started only when the job starts running', async () => {
    await runPass('Pending', 'RUNNING')
    expect(recordedEvents()).toEqual(['job_started'])

    vi.mocked(recordWorkerUsageEvent).mockClear()
    await runPass('Running', 'RUNNING')
    expect(recordedEvents()).toEqual([])
  })
})
