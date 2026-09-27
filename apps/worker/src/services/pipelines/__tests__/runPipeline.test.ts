import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job as BullMQJob } from 'bullmq'
import type { IJob } from '@bilbomd/mongodb-schema'

const { calls, runPipelineStepMock } = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    runPipelineStepMock: vi.fn(
      async (
        _mq: unknown,
        _job: unknown,
        label: string,
        step: string | undefined,
        fn: () => Promise<void>
      ) => {
        calls.push(`step:${label}:${step ?? '-'}`)
        await fn()
      }
    )
  }
})

vi.mock('../../functions/job-utils.js', () => ({
  initializeJob: vi.fn(async () => {
    calls.push('init')
  }),
  cleanupJob: vi.fn(async () => {
    calls.push('cleanup')
  }),
  runPipelineStep: runPipelineStepMock
}))

vi.mock('../../functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(async (e: { eventType: string }) => {
    calls.push(`usage:${e.eventType}`)
  }),
  buildContext: vi.fn(() => ({}))
}))

vi.mock('../../functions/progress-tracker.js', () => ({
  createProgressTracker: () => ({
    update: vi.fn(async (n: number) => {
      calls.push(`progress:${n}`)
    })
  })
}))

import { runPipeline, type PipelineDefinition } from '../runPipeline.js'

type TestJob = IJob & { flag?: boolean }

const makeModel = (job: Partial<TestJob> | null) => ({
  findOne: vi.fn(() => ({
    populate: vi.fn(() => ({ exec: vi.fn(async () => job) }))
  }))
})

const mq = {
  data: { jobid: 'job-1' },
  updateProgress: vi.fn(async () => undefined),
  log: vi.fn(async (msg: string) => {
    calls.push(`log:${msg}`)
  })
} as unknown as BullMQJob

const define = (
  job: Partial<TestJob> | null,
  overrides: Partial<PipelineDefinition<TestJob>> = {}
): PipelineDefinition<TestJob> => ({
  pipeline: 'pdb',
  model: makeModel(job) as unknown as PipelineDefinition<TestJob>['model'],
  defaultEngine: 'CHARMM',
  steps: () => [],
  ...overrides
})

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
})

describe('runPipeline', () => {
  it('fails clearly when the job no longer exists', async () => {
    await expect(runPipeline(mq, define(null))).rejects.toThrow(
      'No job found for: job-1'
    )
    expect(calls).not.toContain('init')
  })

  it('uses the job engine, then the default, unless an engine is fixed', async () => {
    await runPipeline(mq, define({ uuid: 'u', md_engine: 'OpenMM' }))
    await runPipeline(mq, define({ uuid: 'u' }))
    await runPipeline(
      mq,
      define({ uuid: 'u', md_engine: 'OpenMM' }, { fixedEngine: 'CHARMM' })
    )

    expect(calls.filter((c) => c.startsWith('log:Using'))).toEqual([
      'log:Using MD engine: OpenMM',
      'log:Using MD engine: CHARMM',
      'log:Using MD engine: CHARMM'
    ])
  })

  it('rejects unsupported engines before initializing, with a default message', async () => {
    await expect(
      runPipeline(
        mq,
        define(
          { uuid: 'u', md_engine: 'CHARMM' },
          { supportedEngines: ['OpenMM'] }
        )
      )
    ).rejects.toThrow('The pdb pipeline does not support md_engine=CHARMM')
    expect(calls).not.toContain('init')
  })

  it('runs steps through runPipelineStep with their progress, and detached steps inline', async () => {
    const order: string[] = []
    await runPipeline(
      mq,
      define(
        { uuid: 'u' },
        {
          steps: () => [
            {
              label: 'a',
              stepKey: 'minimize',
              run: () => void order.push('a'),
              progress: 30
            },
            {
              label: 'movies',
              detached: true,
              run: () => void order.push('m')
            },
            { label: 'b', run: () => void order.push('b') }
          ]
        }
      )
    )

    expect(order).toEqual(['a', 'm', 'b'])
    expect(calls).toEqual([
      'progress:5',
      'usage:job_started',
      'log:Using MD engine: CHARMM',
      'init',
      'progress:10',
      'step:a:minimize',
      'progress:30',
      'step:b:-',
      'cleanup',
      'progress:100',
      'usage:job_completed'
    ])
  })

  it('evaluates `when` only when the step is reached', async () => {
    const ran: string[] = []
    await runPipeline(
      mq,
      define(
        { uuid: 'u', flag: false },
        {
          steps: () => [
            {
              label: 'set-flag',
              run: ({ job }) => {
                job.flag = true
              }
            },
            {
              label: 'needs-flag',
              when: ({ job }) => job.flag === true,
              run: () => void ran.push('needs-flag')
            },
            {
              label: 'never',
              when: () => false,
              run: () => void ran.push('never')
            }
          ]
        }
      )
    )

    expect(ran).toEqual(['needs-flag'])
  })

  it('stops at a failing step without cleaning up', async () => {
    await expect(
      runPipeline(
        mq,
        define(
          { uuid: 'u' },
          {
            steps: () => [
              {
                label: 'boom',
                run: () => {
                  throw new Error('boom')
                }
              },
              { label: 'after', run: () => undefined }
            ]
          }
        )
      )
    ).rejects.toThrow('boom')

    expect(calls).not.toContain('step:after:-')
    expect(calls).not.toContain('cleanup')
    expect(calls).not.toContain('usage:job_completed')
  })

  it('reports the run duration with job completion', async () => {
    const usage = await import('../../functions/usage-events.js')
    await runPipeline(
      mq,
      define({
        uuid: 'u',
        time_started: new Date('2026-01-01T00:00:00Z'),
        time_completed: new Date('2026-01-01T00:02:30Z')
      })
    )

    expect(vi.mocked(usage.recordWorkerUsageEvent)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: 'job_completed',
        pipeline: 'pdb',
        durationMs: 150_000
      })
    )
  })
})
