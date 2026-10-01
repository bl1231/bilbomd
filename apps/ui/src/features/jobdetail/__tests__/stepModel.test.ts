import { describe, it, expect } from 'vitest'
import type { JobStepsDTO } from '@bilbomd/bilbomd-types'
import {
  orderedSteps,
  runningStep,
  erroredStepMessage,
  isCpuFallback,
  stepDurationMs,
  jobDurationMs,
  formatDuration,
  isFinishedStatus
} from '../stepModel'

const s = (status: string, message = '') =>
  ({ status, message }) as JobStepsDTO['md']

describe('orderedSteps', () => {
  it('sorts steps into pipeline order and splits out NERSC steps', () => {
    const steps = {
      results: s('Waiting'),
      md: s('Running'),
      nersc_job_status: s('Running'),
      minimize: s('Success'),
      nersc_prepare_slurm_batch: s('Success'),
      movies: s('Waiting'),
      dcd2pdb: s('Waiting')
    } as JobStepsDTO

    const { pipeline, nersc } = orderedSteps(steps, 'pdb')

    expect(pipeline.map((x) => x.name)).toEqual([
      'minimize',
      'md',
      'dcd2pdb',
      'movies',
      'results'
    ])
    expect(nersc.map((x) => x.name)).toEqual([
      'nersc_prepare_slurm_batch',
      'nersc_job_status'
    ])
  })

  it('orders Scoper steps as they run: FoXS scoring before IonNet', () => {
    const steps = {
      email: s('Waiting'),
      results: s('Waiting'),
      multifoxs: s('Waiting'),
      ionnet: s('Waiting'),
      foxs: s('Waiting'),
      kgs: s('Waiting'),
      rnaview: s('Waiting'),
      reduce: s('Waiting')
    } as JobStepsDTO

    expect(orderedSteps(steps, 'scoper').pipeline.map((x) => x.name)).toEqual([
      'reduce',
      'rnaview',
      'kgs',
      'foxs',
      'ionnet',
      'multifoxs',
      'results',
      'email'
    ])
  })

  it('hides steps a job type skips, but only while they are Waiting', () => {
    const steps = {
      autorg: s('Success', 'Rg 25'),
      pae: s('Waiting'),
      md: s('Waiting')
    } as JobStepsDTO

    const names = orderedSteps(steps, 'pdb').pipeline.map((x) => x.name)

    expect(names).toEqual(['autorg', 'md'])
  })

  it('ignores _id and non-step values', () => {
    const steps = {
      _id: 'abc',
      md: s('Waiting')
    } as unknown as JobStepsDTO
    expect(orderedSteps(steps, 'scoper').pipeline.map((x) => x.name)).toEqual([
      'md'
    ])
  })

  it('sorts unknown steps alphabetically after known ones', () => {
    const steps = {
      zeta: s('Waiting'),
      alpha_new: s('Waiting'),
      md: s('Waiting')
    } as unknown as JobStepsDTO
    expect(orderedSteps(steps, 'pdb').pipeline.map((x) => x.name)).toEqual([
      'md',
      'alpha_new',
      'zeta'
    ])
  })

  it('handles missing steps', () => {
    expect(orderedSteps(undefined, 'pdb')).toEqual({ pipeline: [], nersc: [] })
  })
})

describe('step helpers', () => {
  const steps = {
    minimize: s('Success', 'done'),
    md: s('Running', 'MD 2/4 (CUDA unavailable, running on CPU)'),
    foxs: s('Error', 'FoXS crashed')
  } as JobStepsDTO

  it('finds the running step', () => {
    expect(runningStep(steps)?.name).toBe('md')
    expect(runningStep({ md: s('Success') } as JobStepsDTO)).toBeUndefined()
  })

  it('finds the errored step message', () => {
    expect(erroredStepMessage(steps)).toBe('FoXS crashed')
    expect(erroredStepMessage(undefined)).toBeNull()
  })

  it('detects the CPU fallback note on the md step', () => {
    expect(isCpuFallback(steps)).toBe(true)
    expect(isCpuFallback({ md: s('Running', 'MD 2/4') } as JobStepsDTO)).toBe(
      false
    )
  })
})

describe('durations', () => {
  const now = new Date('2026-09-29T15:00:00Z')

  it('prefers the stored step duration', () => {
    expect(
      stepDurationMs(
        { name: 'md', status: 'Success', message: '', durationMs: 5000 },
        now
      )
    ).toBe(5000)
  })

  it('measures a running step up to now', () => {
    expect(
      stepDurationMs(
        {
          name: 'md',
          status: 'Running',
          message: '',
          startedAt: new Date('2026-09-29T14:59:00Z')
        },
        now
      )
    ).toBe(60_000)
  })

  it('uses completed_at for a finished step without a stored duration', () => {
    expect(
      stepDurationMs(
        {
          name: 'md',
          status: 'Success',
          message: '',
          startedAt: new Date('2026-09-29T14:00:00Z'),
          completedAt: new Date('2026-09-29T14:00:30Z')
        },
        now
      )
    ).toBe(30_000)
  })

  it('has no duration for a finished step missing its completion time', () => {
    expect(
      stepDurationMs(
        {
          name: 'md',
          status: 'Success',
          message: '',
          startedAt: new Date('2026-09-29T14:00:00Z')
        },
        now
      )
    ).toBeUndefined()
  })

  it('handles ISO strings from JSON as well as Dates', () => {
    expect(
      jobDurationMs(
        {
          startedAt: '2026-09-29T14:00:00Z' as unknown as Date,
          completedAt: '2026-09-29T15:00:00Z' as unknown as Date
        },
        now
      )
    ).toBe(3_600_000)
    expect(jobDurationMs({}, now)).toBeUndefined()
  })

  it('formats durations like the existing pages', () => {
    expect(formatDuration(5_000)).toBe('5s')
    expect(formatDuration(65_000)).toBe('1m 5s')
    expect(formatDuration(3_725_000)).toBe('1h 2m 5s')
  })

  it('knows which job statuses are final', () => {
    expect(isFinishedStatus('Completed')).toBe(true)
    expect(isFinishedStatus('Failed')).toBe(true)
    expect(isFinishedStatus('Running')).toBe(false)
    expect(isFinishedStatus(undefined)).toBe(false)
  })
})
