import { describe, it, expect, vi, beforeEach } from 'vitest'

const callOrder: string[] = []

const stub = (name: string) => {
  return vi.fn(async () => {
    callOrder.push(name)
  })
}

vi.mock('@bilbomd/mongodb-schema', () => ({
  BilboMdAlphaFoldJob: {
    findOne: vi.fn(() => ({
      populate: vi.fn(() => ({
        exec: vi.fn(async () => ({
          _id: 'job-id',
          uuid: 'abc',
          md_engine: 'OpenMM',
          access_mode: 'user',
          public_id: undefined,
          client_ip_hash: undefined,
          user: { username: 'u' },
          time_started: undefined,
          time_completed: undefined,
          pdb_file: undefined
        }))
      }))
    }))
  }
}))

vi.mock('../../functions/alphafold-functions.js', () => ({
  runAlphaFold: vi.fn(async (_mq: unknown, job: { pdb_file?: string }) => {
    job.pdb_file = 'af-rank1.pdb'
    callOrder.push('alphafold')
  })
}))

vi.mock('../../functions/bilbomd-step-functions.js', () => ({
  runPaeToConstInp: stub('pae'),
  runMultiFoxs: stub('multifoxs')
}))

vi.mock('../../functions/openmm-functions.js', () => ({
  prepareOpenMMConfig: stub('openmm-config'),
  runOmmMinimize: stub('minimize'),
  runOmmHeat: stub('heat'),
  runOmmMD: stub('md')
}))

vi.mock('../../functions/pdb-to-crd.js', () => ({
  runStripIons: vi.fn(async () => {
    callOrder.push('strip-ions')
  })
}))

vi.mock('../../functions/foxs-functions.js', () => ({
  runFoXS: stub('foxs')
}))

vi.mock('../../functions/foxs-analysis.js', () => ({
  runSingleFoXS: stub('initfoxs')
}))

vi.mock('../../functions/movie-enqueuer.js', () => ({
  enqueueMakeMovie: vi.fn(() => {
    callOrder.push('enqueueMakeMovie')
  })
}))

vi.mock('../../functions/bilbomd-step-functions-nersc.js', () => ({
  prepareBilboMDResults: stub('results')
}))

vi.mock('../../functions/job-utils.js', () => ({
  initializeJob: stub('initializeJob'),
  cleanupJob: stub('cleanupJob')
}))

vi.mock('../../functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(async () => undefined),
  buildContext: vi.fn(() => ({}))
}))

vi.mock('../../functions/progress-tracker.js', () => ({
  createProgressTracker: vi.fn(() => ({
    update: vi.fn(async () => undefined)
  }))
}))

const fakeMQ = {
  data: { jobid: 'job-id' },
  updateProgress: vi.fn(async () => undefined),
  log: vi.fn(async () => undefined)
}

describe('processBilboMDAlphaFoldJob', () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it('runs steps in the expected order', async () => {
    const { processBilboMDAlphaFoldJob } =
      await import('../bilbomd-alphafold.js')
    await processBilboMDAlphaFoldJob(fakeMQ as never)

    expect(callOrder).toEqual([
      'initializeJob',
      'alphafold',
      'strip-ions',
      'openmm-config',
      'pae',
      'openmm-config',
      'minimize',
      'initfoxs',
      'heat',
      'md',
      'enqueueMakeMovie',
      'foxs',
      'multifoxs',
      'results',
      'cleanupJob'
    ])
  })

  it('rejects CHARMM AF jobs locally', async () => {
    const schema = await import('@bilbomd/mongodb-schema')
    const findOne = vi.mocked(
      (schema as unknown as { BilboMdAlphaFoldJob: { findOne: () => unknown } })
        .BilboMdAlphaFoldJob.findOne
    )
    findOne.mockReturnValueOnce({
      populate: vi.fn(() => ({
        exec: vi.fn(async () => ({
          _id: 'job-id',
          uuid: 'abc',
          md_engine: 'CHARMM',
          access_mode: 'user',
          user: { username: 'u' }
        }))
      }))
    } as never)

    const { processBilboMDAlphaFoldJob } =
      await import('../bilbomd-alphafold.js')
    await expect(processBilboMDAlphaFoldJob(fakeMQ as never)).rejects.toThrow(
      /OpenMM/
    )
  })
})
