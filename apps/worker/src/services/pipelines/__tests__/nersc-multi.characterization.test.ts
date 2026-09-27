import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job as BullMQJob } from 'bullmq'

// Characterization tests for the two pipelines that don't use runPipeline:
// NERSC submission (the rest of a NERSC job runs in bilboMdNerscJobMonitor)
// and multi (MultiFoXS over several finished BilboMD jobs). The inline
// snapshots pin today's behaviour, including what gets saved on the job and
// which usage events are recorded, so refactors can prove they change
// nothing.

const { trace, state, record, findOne } = vi.hoisted(() => {
  const trace: string[] = []
  const state = {
    job: {} as Record<string, unknown>,
    failAt: undefined as string | undefined
  }
  const record = (name: string, result?: unknown) =>
    vi.fn(async () => {
      trace.push(`fn:${name}`)
      if (state.failAt === name) throw new Error(`${name} failed`)
      return result
    })
  // Supports any number of chained .populate() calls before .exec()
  const findOne = () => {
    const query = {
      populate: (path: string) => {
        trace.push(`populate:${path}`)
        return query
      },
      exec: async () => state.job
    }
    return query
  }
  return { trace, state, record, findOne }
})

vi.mock('@bilbomd/mongodb-schema', () => ({
  Job: { findOne },
  MultiJob: { findOne }
}))

vi.mock('../../functions/nersc-slurm.js', () => ({
  updateNerscSpecificSteps: record('updateNerscSpecificSteps'),
  makeBilboMDSlurm: record('makeBilboMDSlurm'),
  submitBilboMDSlurm: record('submitBilboMDSlurm', '12345678')
}))

vi.mock('../../functions/bilbomd-multi-functions.js', () => ({
  initializeJob: record('initializeJob'),
  prepareMultiMDdatFileList: record('prepareMultiMDdatFileList'),
  runMultiFoxs: record('runMultiFoxs'),
  prepareMultiMDResults: record('prepareMultiMDResults'),
  cleanupJob: record('cleanupJob')
}))

vi.mock('../../functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(async (e: Record<string, unknown>) => {
    trace.push(`usage:${JSON.stringify(e)}`)
  }),
  buildContext: vi.fn((c: Record<string, unknown>) => ({ built: c })),
  toPipeline: vi.fn((p: string) => `pipeline(${p})`)
}))

vi.mock('../../../helpers/jobEvents.js', () => ({
  notifyJobChanged: vi.fn(() => {
    trace.push('notify')
  })
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { processBilboMDJobNersc } from '../bilbomd-nersc.js'
import { processMultiMDJob } from '../bilbomd-multi.js'

const makeMQ = () =>
  ({
    data: { jobid: 'job-id', uuid: 'uuid-1' },
    updateProgress: vi.fn(async (n: number) => {
      trace.push(`mq.progress:${n}`)
    }),
    log: vi.fn(async (msg: string) => {
      trace.push(`log:${msg}`)
    })
  }) as unknown as BullMQJob

const makeJob = (fields: Record<string, unknown>) => {
  const job: Record<string, unknown> = {
    _id: 'job-id',
    uuid: 'uuid-1',
    user: { username: 'u' },
    ...fields
  }
  job.save = vi.fn(async () => {
    trace.push(
      `save:status=${job.status ?? '-'},progress=${job.progress ?? '-'}`
    )
  })
  return job
}

const run = async (
  processor: (mq: BullMQJob) => Promise<void>,
  job: Record<string, unknown> | null
) => {
  state.job = job as Record<string, unknown>
  let error: string | undefined
  try {
    await processor(makeMQ())
  } catch (e) {
    error = (e as Error).message
  }
  return { trace, error }
}

beforeEach(() => {
  trace.length = 0
  state.failAt = undefined
})

describe('nersc pipeline', () => {
  const nerscJob = () =>
    makeJob({
      __t: 'BilboMdPDB',
      access_mode: 'user',
      nersc: { qos: 'regular' }
    })

  it('submits the Slurm job and records a pending job_started event', async () => {
    expect(await run(processBilboMDJobNersc, nerscJob()))
      .toMatchInlineSnapshot(`
      {
        "error": undefined,
        "trace": [
          "mq.progress:1",
          "populate:user",
          "mq.progress:5",
          "mq.progress:10",
          "fn:updateNerscSpecificSteps",
          "fn:makeBilboMDSlurm",
          "mq.progress:15",
          "fn:submitBilboMDSlurm",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"pipeline(pdb)","eventType":"job_started","status":"Pending","nersc":{"jobid":"12345678","qos":"regular"},"context":{"built":{"access_mode":"user","user":{"username":"u"}}},"metadata":{"stage":"submitSlurm"}}",
          "mq.progress:100",
        ],
      }
    `)
  })

  it('records job_failed and rethrows when submission fails', async () => {
    state.failAt = 'submitBilboMDSlurm'
    expect(await run(processBilboMDJobNersc, nerscJob()))
      .toMatchInlineSnapshot(`
      {
        "error": "submitBilboMDSlurm failed",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "mq.progress:5",
          "mq.progress:10",
          "fn:updateNerscSpecificSteps",
          "fn:makeBilboMDSlurm",
          "mq.progress:15",
          "fn:submitBilboMDSlurm",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"pipeline(pdb)","eventType":"job_failed","status":"Failed","nersc":{"qos":"regular"},"context":{"built":{"access_mode":"user","user":{"username":"u"}}},"metadata":{"stage":"submitSlurm","error":"submitBilboMDSlurm failed"}}",
        ],
      }
    `)
  })

  it('stops before submitting when the slurm file cannot be made', async () => {
    state.failAt = 'makeBilboMDSlurm'
    expect(await run(processBilboMDJobNersc, nerscJob()))
      .toMatchInlineSnapshot(`
      {
        "error": "makeBilboMDSlurm failed",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "mq.progress:5",
          "mq.progress:10",
          "fn:updateNerscSpecificSteps",
          "fn:makeBilboMDSlurm",
        ],
      }
    `)
  })

  it('falls back to the auto pipeline name for a bare job type', async () => {
    const job = nerscJob()
    job.__t = 'BilboMd'
    expect(await run(processBilboMDJobNersc, job)).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "trace": [
          "mq.progress:1",
          "populate:user",
          "mq.progress:5",
          "mq.progress:10",
          "fn:updateNerscSpecificSteps",
          "fn:makeBilboMDSlurm",
          "mq.progress:15",
          "fn:submitBilboMDSlurm",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"pipeline(auto)","eventType":"job_started","status":"Pending","nersc":{"jobid":"12345678","qos":"regular"},"context":{"built":{"access_mode":"user","user":{"username":"u"}}},"metadata":{"stage":"submitSlurm"}}",
          "mq.progress:100",
        ],
      }
    `)
  })

  it('throws when the job does not exist', async () => {
    expect(await run(processBilboMDJobNersc, null)).toMatchInlineSnapshot(`
      {
        "error": "No job found for: job-id",
        "trace": [
          "mq.progress:1",
          "populate:user",
        ],
      }
    `)
  })
})

describe('multi pipeline', () => {
  const multiJob = () =>
    makeJob({
      time_started: new Date('2026-09-26T10:00:00Z'),
      time_completed: new Date('2026-09-26T10:01:00Z')
    })

  it('runs every step, saving progress after each', async () => {
    expect(await run(processMultiMDJob, multiJob())).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_started","status":"Running","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
          "fn:initializeJob",
          "save:status=-,progress=5",
          "notify",
          "fn:prepareMultiMDdatFileList",
          "save:status=-,progress=30",
          "notify",
          "fn:runMultiFoxs",
          "save:status=-,progress=80",
          "notify",
          "fn:prepareMultiMDResults",
          "save:status=-,progress=90",
          "notify",
          "fn:cleanupJob",
          "mq.progress:100",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_completed","status":"Completed","durationMs":60000,"context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
        ],
      }
    `)
  })

  it('omits durationMs when the job has no timestamps', async () => {
    expect(await run(processMultiMDJob, makeJob({}))).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_started","status":"Running","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
          "fn:initializeJob",
          "save:status=-,progress=5",
          "notify",
          "fn:prepareMultiMDdatFileList",
          "save:status=-,progress=30",
          "notify",
          "fn:runMultiFoxs",
          "save:status=-,progress=80",
          "notify",
          "fn:prepareMultiMDResults",
          "save:status=-,progress=90",
          "notify",
          "fn:cleanupJob",
          "mq.progress:100",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_completed","status":"Completed","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
        ],
      }
    `)
  })

  it('stops at the first step that throws', async () => {
    state.failAt = 'runMultiFoxs'
    expect(await run(processMultiMDJob, multiJob())).toMatchInlineSnapshot(`
      {
        "error": "runMultiFoxs failed",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_started","status":"Running","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
          "fn:initializeJob",
          "save:status=-,progress=5",
          "notify",
          "fn:prepareMultiMDdatFileList",
          "save:status=-,progress=30",
          "notify",
          "fn:runMultiFoxs",
          "save:status=Error,progress=30",
          "notify",
        ],
      }
    `)
  })

  it('marks the job as Error when a step without a status throws', async () => {
    state.failAt = 'prepareMultiMDdatFileList'
    expect(await run(processMultiMDJob, multiJob())).toMatchInlineSnapshot(`
      {
        "error": "prepareMultiMDdatFileList failed",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_started","status":"Running","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
          "fn:initializeJob",
          "save:status=-,progress=5",
          "notify",
          "fn:prepareMultiMDdatFileList",
          "save:status=Error,progress=5",
          "notify",
        ],
      }
    `)
  })

  it('marks the job as Error when gathering results throws', async () => {
    state.failAt = 'prepareMultiMDResults'
    expect(await run(processMultiMDJob, multiJob())).toMatchInlineSnapshot(`
      {
        "error": "prepareMultiMDResults failed",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
          "usage:{"uuid":"uuid-1","jobId":"job-id","pipeline":"multi","eventType":"job_started","status":"Running","context":{"built":{"access_mode":"user","user":{"username":"u"}}}}",
          "fn:initializeJob",
          "save:status=-,progress=5",
          "notify",
          "fn:prepareMultiMDdatFileList",
          "save:status=-,progress=30",
          "notify",
          "fn:runMultiFoxs",
          "save:status=-,progress=80",
          "notify",
          "fn:prepareMultiMDResults",
          "save:status=Error,progress=80",
          "notify",
        ],
      }
    `)
  })

  it('throws when the job does not exist', async () => {
    expect(await run(processMultiMDJob, null)).toMatchInlineSnapshot(`
      {
        "error": "No job found for: job-id",
        "trace": [
          "mq.progress:1",
          "populate:user",
          "populate:bilbomd_jobs",
        ],
      }
    `)
  })
})
