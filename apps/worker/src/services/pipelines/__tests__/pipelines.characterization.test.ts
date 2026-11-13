import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job as BullMQJob } from 'bullmq'

// Characterization tests: record everything each BilboMD pipeline does, in
// order, for every engine it supports: which steps run (with their log
// labels and step keys), which functions they call, progress updates, usage
// events, and init/cleanup. The inline snapshots pin today's behaviour so
// pipeline refactors can prove they change nothing (or exactly what they
// intend to).

const { trace, state, record, findOne } = vi.hoisted(() => {
  const trace: string[] = []
  const state = {
    job: {} as Record<string, unknown>,
    failAt: undefined as string | undefined
  }
  const record = (name: string) =>
    vi.fn(async () => {
      trace.push(`fn:${name}`)
      if (state.failAt === name) throw new Error(`${name} failed`)
    })
  const findOne = () => ({
    populate: () => ({ exec: async () => state.job })
  })
  return { trace, state, record, findOne }
})

vi.mock('@bilbomd/mongodb-schema', () => ({
  BilboMdPDBJob: { findOne },
  BilboMdCRDJob: { findOne },
  BilboMdAutoJob: { findOne },
  BilboMdAlphaFoldJob: { findOne },
  BilboMdOpenFoldJob: { findOne },
  BilboMdBioEmuJob: { findOne },
  BilboMdSANSJob: { findOne }
}))

vi.mock('../../functions/job-utils.js', () => ({
  initializeJob: vi.fn(async () => {
    trace.push('init')
  }),
  cleanupJob: vi.fn(async () => {
    trace.push('cleanup')
  }),
  // Mirrors the real runPipelineStep: log, run, and on failure hand off to
  // handleError (which marks the job failed and re-throws)
  runPipelineStep: vi.fn(
    async (
      mq: BullMQJob,
      _job: unknown,
      label: string,
      step: string | undefined,
      fn: () => Promise<void>
    ) => {
      trace.push(`step:${label}:${step ?? '-'}`)
      await mq.log(`start ${label}`)
      try {
        await fn()
      } catch (error) {
        trace.push(`handleError:${step ?? '-'}`)
        throw error
      }
      await mq.log(`end ${label}`)
    }
  )
}))

vi.mock('../../functions/charmm-md.js', () => ({
  runMinimize: record('runMinimize'),
  runHeat: record('runHeat'),
  runMolecularDynamics: record('runMolecularDynamics')
}))

// The test machine has no CHARMM binary; runPipeline.test.ts covers the check.
vi.mock('../../functions/charmm.js', () => ({
  assertCharmmAvailable: vi.fn(async () => undefined)
}))

vi.mock('../../functions/multifoxs.js', () => ({
  runMultiFoxs: record('runMultiFoxs')
}))

vi.mock('../../functions/pae-constraints.js', () => ({
  runPaeToConstInp: record('runPaeToConstInp')
}))

vi.mock('../../functions/autorg.js', () => ({
  runAutoRg: record('runAutoRg')
}))

vi.mock('../../functions/openmm-functions.js', () => ({
  prepareOpenMMConfig: record('prepareOpenMMConfig'),
  runOmmMinimize: record('runOmmMinimize'),
  runOmmHeat: record('runOmmHeat'),
  runOmmMD: record('runOmmMD')
}))

vi.mock('../../functions/pdb-to-crd.js', () => ({
  runCifToPdb: vi.fn(async () => {
    trace.push('fn:runCifToPdb')
    return 'converted.pdb'
  }),
  runPrepPdb: record('runPrepPdb'),
  runPdb2Crd: record('runPdb2Crd')
}))

vi.mock('../../functions/bilbomd-functions.js', () => ({
  extractPDBFilesFromDCD: record('extractPDBFilesFromDCD'),
  remediatePDBFiles: record('remediatePDBFiles')
}))

vi.mock('../../functions/sans-trajectory.js', () => ({
  extractPDBFilesFromDCD: record('sans.extractPDBFilesFromDCD'),
  remediatePDBFiles: record('sans.remediatePDBFiles'),
  mirrorOmmMdToPepsiSANS: record('sans.mirrorOmmMdToPepsiSANS')
}))

vi.mock('../../functions/sans-pepsisans.js', () => ({
  runPepsiSANSOnPDBFiles: record('sans.runPepsiSANSOnPDBFiles')
}))

vi.mock('../../functions/sans-gasans.js', () => ({
  runGASANS: record('sans.runGASANS')
}))

vi.mock('../../functions/sans-results.js', () => ({
  prepareBilboMDSANSResults: record('sans.prepareBilboMDSANSResults')
}))

vi.mock('../../functions/foxs-functions.js', () => ({
  runFoXS: record('runFoXS')
}))

vi.mock('../../functions/foxs-analysis.js', () => ({
  runSingleFoXS: record('runSingleFoXS')
}))

vi.mock('../../functions/prepare-results.js', () => ({
  prepareBilboMDResults: record('prepareBilboMDResults')
}))

vi.mock('../../functions/alphafold-functions.js', () => ({
  runAlphaFold: vi.fn(async (_mq: unknown, job: { pdb_file?: string }) => {
    trace.push('fn:runAlphaFold')
    job.pdb_file = 'af-rank1.pdb'
  })
}))

vi.mock('../../functions/openfold-functions.js', () => ({
  runOpenFold: vi.fn(async (_mq: unknown, job: { pdb_file?: string }) => {
    trace.push('fn:runOpenFold')
    job.pdb_file = 'of3-rank1.pdb'
  })
}))

vi.mock('../../functions/bioemu-functions.js', () => ({
  runBioEmu: record('runBioEmu')
}))

vi.mock('../../functions/polish-functions.js', () => ({
  runPolish: record('runPolish')
}))

vi.mock('../../functions/movie-enqueuer.js', () => ({
  enqueueMakeMovie: vi.fn(() => {
    trace.push('fn:enqueueMakeMovie')
  })
}))

vi.mock('../../functions/usage-events.js', () => ({
  recordWorkerUsageEvent: vi.fn(
    async (e: { eventType: string; pipeline: string; durationMs?: number }) => {
      trace.push(`usage:${e.eventType}:${e.pipeline}:${e.durationMs ?? '-'}`)
    }
  ),
  buildContext: vi.fn(() => ({}))
}))

vi.mock('../../functions/progress-tracker.js', () => ({
  createProgressTracker: () => ({
    update: vi.fn(async (n: number) => {
      trace.push(`progress:${n}`)
    })
  })
}))

vi.mock('fs-extra', () => ({
  default: {
    copy: vi.fn(async (_src: string, dest: string) => {
      trace.push(`fs.copy:${dest.split('/').pop()}`)
    })
  }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

import { processBilboMDPDBJob } from '../bilbomd-pdb.js'
import { processBilboMDCRDJob } from '../bilbomd-crd.js'
import { processBilboMDAutoJob } from '../bilbomd-auto.js'
import { processBilboMDAlphaFoldJob } from '../bilbomd-alphafold.js'
import { processBilboMDOpenFoldJob } from '../bilbomd-openfold.js'
import { processBilboMDSANSJob } from '../bilbomd-sans.js'
import { processBilboMDBioEmuJob } from '../bilbomd-bioemu.js'

const makeMQ = () =>
  ({
    data: { jobid: 'job-id' },
    updateProgress: vi.fn(async (n: number) => {
      trace.push(`mq.progress:${n}`)
    }),
    log: vi.fn(async (msg: string) => {
      trace.push(`log:${msg}`)
    })
  }) as unknown as BullMQJob

const run = async (
  processor: (mq: BullMQJob) => Promise<void>,
  job: Record<string, unknown> = {}
) => {
  state.job = {
    _id: 'job-id',
    uuid: 'uuid-1',
    pdb_file: 'model.pdb',
    access_mode: 'user',
    user: { username: 'u' },
    time_started: new Date('2026-09-26T10:00:00Z'),
    time_completed: new Date('2026-09-26T10:01:00Z'),
    ...job
  }
  await processor(makeMQ())
  return trace
}

beforeEach(() => {
  trace.length = 0
  state.failAt = undefined
})

describe('pdb pipeline', () => {
  it('CHARMM', async () => {
    expect(await run(processBilboMDPDBJob, { md_engine: 'CHARMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:pdb:-",
          "log:Using MD engine: CHARMM",
          "init",
          "progress:10",
          "step:pdb2crd:pdb2crd",
          "log:start pdb2crd",
          "fn:runPdb2Crd",
          "log:end pdb2crd",
          "progress:15",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runMinimize",
          "log:end minimize",
          "progress:25",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:30",
          "step:heat:heat",
          "log:start heat",
          "fn:runHeat",
          "log:end heat",
          "progress:40",
          "step:md:md",
          "log:start md",
          "fn:runMolecularDynamics",
          "log:end md",
          "progress:50",
          "step:dcd2pdb:dcd2pdb",
          "log:start dcd2pdb",
          "fn:extractPDBFilesFromDCD",
          "log:end dcd2pdb",
          "progress:60",
          "step:remediate:pdb_remediate",
          "log:start remediate",
          "fn:remediatePDBFiles",
          "log:end remediate",
          "progress:70",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:80",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:pdb:60000",
        ]
      `)
  })

  it('OpenMM', async () => {
    expect(await run(processBilboMDPDBJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:pdb:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:prep-pdb:-",
          "log:start prep-pdb",
          "fn:runPrepPdb",
          "log:end prep-pdb",
          "step:openmm-config:-",
          "log:start openmm-config",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config",
          "progress:15",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runOmmMinimize",
          "log:end minimize",
          "progress:25",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:30",
          "step:heat:heat",
          "log:start heat",
          "fn:runOmmHeat",
          "log:end heat",
          "progress:40",
          "step:md:md",
          "log:start md",
          "fn:runOmmMD",
          "log:end md",
          "progress:50",
          "fn:enqueueMakeMovie",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:80",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:pdb:60000",
        ]
      `)
  })

  it('defaults to CHARMM when md_engine is unset', async () => {
    const withDefault = [...(await run(processBilboMDPDBJob))]
    trace.length = 0
    const charmm = await run(processBilboMDPDBJob, { md_engine: 'CHARMM' })
    expect(withDefault).toEqual(charmm)
  })

  it('converts a CIF upload before anything engine-specific', async () => {
    const t = await run(processBilboMDPDBJob, {
      md_engine: 'OpenMM',
      pdb_file: 'model.cif'
    })
    expect(t.slice(0, 8)).toMatchInlineSnapshot(`
      [
        "mq.progress:1",
        "progress:5",
        "usage:job_started:pdb:-",
        "log:Using MD engine: OpenMM",
        "init",
        "progress:10",
        "step:cif-to-pdb:-",
        "log:start cif-to-pdb",
      ]
    `)
    expect(state.job.pdb_file).toBe('converted.pdb')
  })

  it('stops at the failing step and does not clean up or report completion', async () => {
    state.failAt = 'runOmmHeat'
    await expect(
      run(processBilboMDPDBJob, { md_engine: 'OpenMM' })
    ).rejects.toThrow('runOmmHeat failed')
    expect(trace.slice(-3)).toMatchInlineSnapshot(`
      [
        "log:start heat",
        "fn:runOmmHeat",
        "handleError:heat",
      ]
    `)
    expect(trace).not.toContain('cleanup')
    expect(trace.some((e) => e.startsWith('usage:job_completed'))).toBe(false)
  })
})

describe('crd pipeline', () => {
  it('always uses CHARMM', async () => {
    expect(await run(processBilboMDCRDJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:crd:-",
          "log:Using MD engine: CHARMM",
          "init",
          "progress:10",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runMinimize",
          "log:end minimize",
          "progress:25",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:30",
          "step:heat:heat",
          "log:start heat",
          "fn:runHeat",
          "log:end heat",
          "progress:40",
          "step:md:md",
          "log:start md",
          "fn:runMolecularDynamics",
          "log:end md",
          "progress:50",
          "step:dcd2pdb:dcd2pdb",
          "log:start dcd2pdb",
          "fn:extractPDBFilesFromDCD",
          "log:end dcd2pdb",
          "progress:60",
          "step:remediate:pdb_remediate",
          "log:start remediate",
          "fn:remediatePDBFiles",
          "log:end remediate",
          "progress:70",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:80",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:crd:60000",
        ]
      `)
  })
})

describe('auto pipeline', () => {
  it('CHARMM', async () => {
    expect(await run(processBilboMDAutoJob, { md_engine: 'CHARMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:auto:-",
          "log:Using MD engine: CHARMM",
          "init",
          "progress:10",
          "step:pae:pae",
          "log:start pae",
          "fn:runPaeToConstInp",
          "log:end pae",
          "progress:15",
          "step:autorg:autorg",
          "log:start autorg",
          "fn:runAutoRg",
          "log:end autorg",
          "progress:20",
          "step:pdb2crd:pdb2crd",
          "log:start pdb2crd",
          "fn:runPdb2Crd",
          "log:end pdb2crd",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runMinimize",
          "log:end minimize",
          "progress:25",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:30",
          "step:heat:heat",
          "log:start heat",
          "fn:runHeat",
          "log:end heat",
          "progress:40",
          "step:md:md",
          "log:start md",
          "fn:runMolecularDynamics",
          "log:end md",
          "progress:50",
          "step:dcd2pdb:dcd2pdb",
          "log:start dcd2pdb",
          "fn:extractPDBFilesFromDCD",
          "log:end dcd2pdb",
          "progress:60",
          "step:remediate:pdb_remediate",
          "log:start remediate",
          "fn:remediatePDBFiles",
          "log:end remediate",
          "progress:70",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:80",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:auto:60000",
        ]
      `)
  })

  it('OpenMM', async () => {
    expect(await run(processBilboMDAutoJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:auto:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:pae:pae",
          "log:start pae",
          "fn:runPaeToConstInp",
          "log:end pae",
          "progress:15",
          "step:autorg:autorg",
          "log:start autorg",
          "fn:runAutoRg",
          "log:end autorg",
          "progress:20",
          "step:prep-pdb:-",
          "log:start prep-pdb",
          "fn:runPrepPdb",
          "log:end prep-pdb",
          "step:openmm-config:-",
          "log:start openmm-config",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runOmmMinimize",
          "log:end minimize",
          "progress:25",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:30",
          "step:heat:heat",
          "log:start heat",
          "fn:runOmmHeat",
          "log:end heat",
          "progress:40",
          "step:md:md",
          "log:start md",
          "fn:runOmmMD",
          "log:end md",
          "progress:50",
          "fn:enqueueMakeMovie",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:80",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:auto:60000",
        ]
      `)
  })
})

describe('alphafold pipeline', () => {
  it('OpenMM', async () => {
    expect(await run(processBilboMDAlphaFoldJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:alphafold:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:alphafold:alphafold",
          "log:start alphafold",
          "fn:runAlphaFold",
          "log:end alphafold",
          "progress:25",
          "step:prep-pdb:-",
          "log:start prep-pdb",
          "fn:runPrepPdb",
          "log:end prep-pdb",
          "step:openmm-config:-",
          "log:start openmm-config",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config",
          "step:pae:pae",
          "log:start pae",
          "fn:runPaeToConstInp",
          "log:end pae",
          "progress:30",
          "step:openmm-config-merge:-",
          "log:start openmm-config-merge",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config-merge",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runOmmMinimize",
          "log:end minimize",
          "progress:40",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:45",
          "step:heat:heat",
          "log:start heat",
          "fn:runOmmHeat",
          "log:end heat",
          "progress:55",
          "step:md:md",
          "log:start md",
          "fn:runOmmMD",
          "log:end md",
          "progress:70",
          "fn:enqueueMakeMovie",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:85",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:alphafold:60000",
        ]
      `)
  })

  it('rejects CHARMM before doing anything', async () => {
    await expect(
      run(processBilboMDAlphaFoldJob, { md_engine: 'CHARMM' })
    ).rejects.toThrow(/OpenMM/)
    expect(trace).not.toContain('init')
  })
})

describe('openfold pipeline', () => {
  it('OpenMM', async () => {
    expect(await run(processBilboMDOpenFoldJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:openfold:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:openfold:openfold",
          "log:start openfold",
          "fn:runOpenFold",
          "log:end openfold",
          "progress:25",
          "step:prep-pdb:-",
          "log:start prep-pdb",
          "fn:runPrepPdb",
          "log:end prep-pdb",
          "step:openmm-config:-",
          "log:start openmm-config",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config",
          "step:pae:pae",
          "log:start pae",
          "fn:runPaeToConstInp",
          "log:end pae",
          "progress:30",
          "step:openmm-config-merge:-",
          "log:start openmm-config-merge",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config-merge",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runOmmMinimize",
          "log:end minimize",
          "progress:40",
          "step:initfoxs:initfoxs",
          "log:start initfoxs",
          "fn:runSingleFoXS",
          "log:end initfoxs",
          "progress:45",
          "step:heat:heat",
          "log:start heat",
          "fn:runOmmHeat",
          "log:end heat",
          "progress:55",
          "step:md:md",
          "log:start md",
          "fn:runOmmMD",
          "log:end md",
          "progress:70",
          "fn:enqueueMakeMovie",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:85",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:openfold:60000",
        ]
      `)
  })

  it('rejects CHARMM before doing anything', async () => {
    await expect(
      run(processBilboMDOpenFoldJob, { md_engine: 'CHARMM' })
    ).rejects.toThrow(/OpenMM/)
    expect(trace).not.toContain('init')
  })
})

describe('bioemu pipeline', () => {
  // No input model and no MD: BioEmu2 samples straight into foxs/, and the
  // ensemble members are polished between MultiFoXS and the results
  it('OpenMM', async () => {
    expect(await run(processBilboMDBioEmuJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:bioemu:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:bioemu:bioemu",
          "log:start bioemu",
          "fn:runBioEmu",
          "log:end bioemu",
          "progress:60",
          "step:foxs:foxs",
          "log:start foxs",
          "fn:runFoXS",
          "log:end foxs",
          "progress:75",
          "step:multifoxs:multifoxs",
          "log:start multifoxs",
          "fn:runMultiFoxs",
          "log:end multifoxs",
          "progress:90",
          "step:polish:polish",
          "log:start polish",
          "fn:runPolish",
          "log:end polish",
          "progress:95",
          "step:results:results",
          "log:start results",
          "fn:prepareBilboMDResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:bioemu:60000",
        ]
      `)
  })

  it('polishes with OpenMM even when the job asks for CHARMM', async () => {
    const trace = await run(processBilboMDBioEmuJob, { md_engine: 'CHARMM' })
    expect(trace).toContain('log:Using MD engine: OpenMM')
    expect(trace).toContain('fn:runPolish')
  })

  it('stops after a failed BioEmu2 step', async () => {
    state.failAt = 'runBioEmu'
    await expect(run(processBilboMDBioEmuJob, {})).rejects.toThrow(
      'runBioEmu failed'
    )
    expect(trace).toContain('handleError:bioemu')
    expect(trace).not.toContain('fn:runFoXS')
    expect(trace).not.toContain('cleanup')
  })
})

describe('sans pipeline', () => {
  it('CHARMM', async () => {
    expect(await run(processBilboMDSANSJob, { md_engine: 'CHARMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:sans:-",
          "log:Using MD engine: CHARMM",
          "init",
          "progress:10",
          "step:pdb2crd:pdb2crd",
          "log:start pdb2crd",
          "fn:runPdb2Crd",
          "log:end pdb2crd",
          "progress:15",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runMinimize",
          "log:end minimize",
          "progress:20",
          "step:heat:heat",
          "log:start heat",
          "fn:runHeat",
          "log:end heat",
          "progress:30",
          "step:md:md",
          "log:start md",
          "fn:runMolecularDynamics",
          "log:end md",
          "progress:50",
          "step:dcd2pdb:dcd2pdb",
          "log:start dcd2pdb",
          "fn:sans.extractPDBFilesFromDCD",
          "log:end dcd2pdb",
          "progress:60",
          "step:remediate:pdb_remediate",
          "log:start remediate",
          "fn:sans.remediatePDBFiles",
          "log:end remediate",
          "progress:70",
          "step:pepsisans:pepsisans",
          "log:start pepsisans",
          "fn:sans.runPepsiSANSOnPDBFiles",
          "log:end pepsisans",
          "progress:80",
          "step:ga-sans:gasans",
          "log:start ga-sans",
          "fn:sans.runGASANS",
          "log:end ga-sans",
          "progress:90",
          "step:results:results",
          "log:start results",
          "fn:sans.prepareBilboMDSANSResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:sans:60000",
        ]
      `)
  })

  it('OpenMM', async () => {
    expect(await run(processBilboMDSANSJob, { md_engine: 'OpenMM' }))
      .toMatchInlineSnapshot(`
        [
          "mq.progress:1",
          "progress:5",
          "usage:job_started:sans:-",
          "log:Using MD engine: OpenMM",
          "init",
          "progress:10",
          "step:prep-pdb:-",
          "log:start prep-pdb",
          "fn:runPrepPdb",
          "log:end prep-pdb",
          "step:openmm-config:-",
          "log:start openmm-config",
          "fn:prepareOpenMMConfig",
          "log:end openmm-config",
          "step:minimize:minimize",
          "log:start minimize",
          "fn:runOmmMinimize",
          "fs.copy:minimization_output.pdb",
          "log:end minimize",
          "progress:20",
          "step:heat:heat",
          "log:start heat",
          "fn:runOmmHeat",
          "log:end heat",
          "progress:30",
          "step:md:md",
          "log:start md",
          "fn:runOmmMD",
          "log:end md",
          "progress:50",
          "step:mirror-md-to-pepsisans:-",
          "log:start mirror-md-to-pepsisans",
          "fn:sans.mirrorOmmMdToPepsiSANS",
          "log:end mirror-md-to-pepsisans",
          "fn:enqueueMakeMovie",
          "progress:70",
          "step:pepsisans:pepsisans",
          "log:start pepsisans",
          "fn:sans.runPepsiSANSOnPDBFiles",
          "log:end pepsisans",
          "progress:80",
          "step:ga-sans:gasans",
          "log:start ga-sans",
          "fn:sans.runGASANS",
          "log:end ga-sans",
          "progress:90",
          "step:results:results",
          "log:start results",
          "fn:sans.prepareBilboMDSANSResults",
          "log:end results",
          "progress:99",
          "cleanup",
          "progress:100",
          "usage:job_completed:sans:60000",
        ]
      `)
  })
})

describe('movies', () => {
  it('are queued for OpenMM jobs by default', async () => {
    const trace = await run(processBilboMDPDBJob, { md_engine: 'OpenMM' })
    expect(trace).toContain('fn:enqueueMakeMovie')
  })

  it('are skipped when ENABLE_MOVIES is off', async () => {
    const { config } = await import('../../../config/config.js')
    config.moviesEnabled = false
    try {
      const pdb = await run(processBilboMDPDBJob, { md_engine: 'OpenMM' })
      expect(pdb).not.toContain('fn:enqueueMakeMovie')
      // Everything after the skipped step still runs
      expect(pdb).toContain('fn:prepareBilboMDResults')

      trace.length = 0
      const af = await run(processBilboMDAlphaFoldJob)
      expect(af).not.toContain('fn:enqueueMakeMovie')
      expect(af).toContain('fn:prepareBilboMDResults')
    } finally {
      config.moviesEnabled = true
    }
  })
})
