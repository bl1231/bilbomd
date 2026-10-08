import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import YAML from 'yaml'
import type { IJob } from '@bilbomd/mongodb-schema'

const { state, downloadNerscWorkFile } = vi.hoisted(() => ({
  state: { uploadDir: '' },
  downloadNerscWorkFile: vi.fn()
}))

vi.mock('../../../config/config.js', () => ({
  config: {
    get uploadDir() {
      return state.uploadDir
    }
  }
}))

vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

vi.mock('../nersc-api-functions.js', () => ({ downloadNerscWorkFile }))

import {
  storeNerscMdConstraints,
  storeNerscMdConstraintsMidRun
} from '../nersc-md-constraints.js'

const UUID = 'uuid-1'

// A plain stand-in for the Mongoose document: fields the module reads as
// properties live on the object, those it reads through get()/set() in doc
const makeJob = (fields: Record<string, unknown>) => {
  const doc: Record<string, unknown> = {}
  const job: Record<string, unknown> = {
    uuid: UUID,
    get: vi.fn((key: string) => doc[key]),
    set: vi.fn((key: string, value: unknown) => {
      doc[key] = value
    }),
    save: vi.fn(async () => undefined),
    ...fields
  }
  return { job: job as unknown as IJob, doc, mock: job }
}

const workFile = (name: string) => path.join(state.uploadDir, UUID, name)

// One ATOM record per chain is enough for buildChainMolTypes
const atom = (resName: string, chain: string) =>
  `ATOM      1  N   ${resName.padStart(3)} ${chain}   1       0.000   0.000   0.000  1.00  0.00           N`

const writePdb = (name: string, chains: [string, string][]) =>
  fs.outputFile(
    workFile(name),
    chains.map(([res, chain]) => atom(res, chain)).join('\n') + '\nEND\n'
  )

const FORCEFIELD = ['amber19-all.xml', 'implicit/gbn2.xml']

const FIXED_BODIES = [
  {
    name: 'FixedBody1',
    segments: [{ chain_id: 'A', residues: { start: 1, stop: 100 } }]
  }
]
const RIGID_BODIES = [
  {
    name: 'RigidBody1',
    segments: [{ chain_id: 'B', residues: { start: 5, stop: 50 } }]
  }
]

// What gen-openmm-slurm-file.py writes, after merge_constraints.py has
// folded the PAE constraints in
const writeOpenMMConfig = (constraints?: unknown) =>
  fs.outputFile(
    workFile('openmm_config.yaml'),
    YAML.stringify({
      input: {
        dir: '/bilbomd/work',
        pdb_file: 'af-rank1.pdb',
        forcefield: FORCEFIELD
      },
      output: { output_dir: '/bilbomd/work/openmm' },
      ...(constraints !== undefined && { constraints }),
      steps: {}
    })
  )

const CONST_INP = `define fixed1 sele ( resid 1:100 .and. segid PROA ) end
cons fix sele fixed1 end

define rigid1 sele ( resid 5:50 .and. segid DNAB ) end
shape desc dock1 rigid sele rigid1 end

return`

// What gen-openmm-slurm-file.py writes, as text, for the download mock
const openMMConfigText = (constraints?: unknown) =>
  YAML.stringify({
    input: {
      dir: '/bilbomd/work',
      pdb_file: 'af-rank1.pdb',
      forcefield: FORCEFIELD
    },
    ...(constraints !== undefined && { constraints }),
    steps: {}
  })

const pdbText = (chains: [string, string][]) =>
  chains.map(([res, chain]) => atom(res, chain)).join('\n') + '\nEND\n'

// The Slurm work dir on PSCRATCH, as the NERSC download API sees it
const mockWorkDir = (files: Record<string, string>) => {
  downloadNerscWorkFile.mockImplementation(
    async (_uuid: string, name: string) => {
      if (name in files) return files[name]
      throw new Error(`Failed to download ${name}`)
    }
  )
}

const downloaded = () =>
  downloadNerscWorkFile.mock.calls.map(([, name]) => name as string)

beforeEach(async () => {
  state.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nersc-md-'))
  await fs.ensureDir(path.join(state.uploadDir, UUID))
  downloadNerscWorkFile.mockReset()
  mockWorkDir({})
})

afterEach(async () => {
  await fs.remove(state.uploadDir)
})

describe('storeNerscMdConstraints (OpenMM)', () => {
  it('records the force field and PAE constraints of an AlphaFold job from openmm_config.yaml', async () => {
    await writeOpenMMConfig({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES
    })
    await writePdb('af-rank1.pdb', [
      ['MET', 'A'],
      ['DA', 'B']
    ])
    const { job, mock } = makeJob({
      __t: 'BilboMdAlphaFold',
      md_engine: 'OpenMM'
    })

    await storeNerscMdConstraints(job)

    expect(job.openmm_forcefield).toEqual(FORCEFIELD)
    expect(job.md_constraints).toEqual({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES,
      chain_mol_types: [
        { chain_id: 'A', mol_type: 'PRO' },
        { chain_id: 'B', mol_type: 'DNA' }
      ]
    })
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('reads chain types from the uploaded PDB of an Auto job', async () => {
    await writeOpenMMConfig({ fixed_bodies: FIXED_BODIES, rigid_bodies: [] })
    await writePdb('model.pdb', [['GLY', 'C']])
    const { job, doc } = makeJob({ __t: 'BilboMdAuto', md_engine: 'OpenMM' })
    doc.pdb_file = 'model.pdb'

    await storeNerscMdConstraints(job)

    expect(job.md_constraints?.chain_mol_types).toEqual([
      { chain_id: 'C', mol_type: 'PRO' }
    ])
  })

  it('keeps the constraints the backend stored at submission and only adds the force field', async () => {
    const stored = { fixed_bodies: [], rigid_bodies: RIGID_BODIES }
    await writeOpenMMConfig({ fixed_bodies: FIXED_BODIES, rigid_bodies: [] })
    const { job, mock } = makeJob({
      __t: 'BilboMdPDB',
      md_engine: 'OpenMM',
      md_constraints: stored
    })

    await storeNerscMdConstraints(job)

    expect(job.openmm_forcefield).toEqual(FORCEFIELD)
    expect(job.md_constraints).toBe(stored)
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('leaves out chain_mol_types when the PDB is not in the work dir', async () => {
    await writeOpenMMConfig({ fixed_bodies: [], rigid_bodies: RIGID_BODIES })
    const { job } = makeJob({ __t: 'BilboMdAlphaFold', md_engine: 'OpenMM' })

    await storeNerscMdConstraints(job)

    expect(job.md_constraints).toEqual({
      fixed_bodies: [],
      rigid_bodies: RIGID_BODIES
    })
  })

  it('does nothing when openmm_config.yaml was not copied back', async () => {
    const { job, mock } = makeJob({ __t: 'BilboMdAuto', md_engine: 'OpenMM' })

    await storeNerscMdConstraints(job)

    expect(job.openmm_forcefield).toBeUndefined()
    expect(job.md_constraints).toBeUndefined()
    expect(mock.save).not.toHaveBeenCalled()
  })
})

describe('storeNerscMdConstraints (CHARMM)', () => {
  it('records the const.inp pae2const.py wrote for an Auto job and points the job at it', async () => {
    await fs.outputFile(workFile('const.inp'), CONST_INP)
    await writePdb('model.pdb', [
      ['MET', 'A'],
      ['DA', 'B']
    ])
    const { job, doc, mock } = makeJob({ __t: 'BilboMdAuto' })
    doc.pdb_file = 'model.pdb'

    await storeNerscMdConstraints(job)

    expect(job.md_constraints).toEqual({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES,
      chain_mol_types: [
        { chain_id: 'A', mol_type: 'PRO' },
        { chain_id: 'B', mol_type: 'DNA' }
      ]
    })
    expect(doc.const_inp_file).toBe('const.inp')
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('uses the predicted model of an AlphaFold job for the chain types', async () => {
    await fs.outputFile(workFile('const.inp'), CONST_INP)
    await writePdb('af-rank1.pdb', [['MET', 'A']])
    const { job } = makeJob({ __t: 'BilboMdAlphaFold' })

    await storeNerscMdConstraints(job)

    expect(job.md_constraints?.chain_mol_types).toEqual([
      { chain_id: 'A', mol_type: 'PRO' }
    ])
  })

  it('reads the chain types from the segids when a CRD job has no PDB', async () => {
    await fs.outputFile(workFile('my_const.inp'), CONST_INP)
    const { job, doc, mock } = makeJob({ __t: 'BilboMdCRD' })
    doc.const_inp_file = 'my_const.inp'

    await storeNerscMdConstraints(job)

    expect(job.md_constraints?.chain_mol_types).toEqual([
      { chain_id: 'A', mol_type: 'PRO' },
      { chain_id: 'B', mol_type: 'DNA' }
    ])
    expect(doc.const_inp_file).toBe('my_const.inp')
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('leaves constraints the backend already stored alone', async () => {
    await fs.outputFile(workFile('const.inp'), CONST_INP)
    const stored = { fixed_bodies: [], rigid_bodies: [] }
    const { job, mock } = makeJob({
      __t: 'BilboMdPDB',
      md_constraints: stored
    })

    await storeNerscMdConstraints(job)

    expect(job.md_constraints).toBe(stored)
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('does nothing when no constraint file was copied back', async () => {
    const { job, doc, mock } = makeJob({ __t: 'BilboMdAuto' })

    await storeNerscMdConstraints(job)

    expect(job.md_constraints).toBeUndefined()
    expect(doc.const_inp_file).toBeUndefined()
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('never fails the job when a file cannot be read', async () => {
    await fs.outputFile(workFile('const.inp'), CONST_INP)
    const { job, mock } = makeJob({ __t: 'BilboMdAuto' })
    vi.mocked(mock.save as () => Promise<void>).mockRejectedValue(
      new Error('db down')
    )

    await expect(storeNerscMdConstraints(job)).resolves.toBeUndefined()
  })
})

describe('storeNerscMdConstraintsMidRun', () => {
  const AF_WORKDIR = {
    'openmm_config.yaml': openMMConfigText({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES
    }),
    'af-rank1.pdb': pdbText([
      ['MET', 'A'],
      ['DA', 'B']
    ])
  }

  it('records an OpenMM AlphaFold job once consmerge has merged the PAE constraints', async () => {
    mockWorkDir(AF_WORKDIR)
    const { job, mock } = makeJob({
      __t: 'BilboMdAlphaFold',
      md_engine: 'OpenMM'
    })

    await storeNerscMdConstraintsMidRun(job, {
      alphafold: 'Success',
      pae2constraints: 'Success',
      consmerge: 'Success',
      minimize: 'Running'
    })

    expect(downloaded()).toEqual(['openmm_config.yaml', 'af-rank1.pdb'])
    expect(job.openmm_forcefield).toEqual(FORCEFIELD)
    expect(job.md_constraints).toEqual({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES,
      chain_mol_types: [
        { chain_id: 'A', mol_type: 'PRO' },
        { chain_id: 'B', mol_type: 'DNA' }
      ]
    })
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('waits for consmerge: the config before the merge has no constraints', async () => {
    mockWorkDir(AF_WORKDIR)
    const { job, mock } = makeJob({
      __t: 'BilboMdAlphaFold',
      md_engine: 'OpenMM'
    })

    await storeNerscMdConstraintsMidRun(job, {
      pae2constraints: 'Success',
      consmerge: 'Running'
    })

    expect(downloaded()).toEqual([])
    expect(job.md_constraints).toBeUndefined()
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('records only the force field of a classic OpenMM job, without a PAE step, from the start', async () => {
    mockWorkDir({ 'openmm_config.yaml': openMMConfigText() })
    const stored = { fixed_bodies: FIXED_BODIES, rigid_bodies: [] }
    const { job, doc, mock } = makeJob({
      __t: 'BilboMdPDB',
      md_engine: 'OpenMM',
      md_constraints: stored
    })
    doc.pdb_file = 'model.pdb'

    await storeNerscMdConstraintsMidRun(job, { minimize: 'Running' })

    expect(downloaded()).toEqual(['openmm_config.yaml'])
    expect(job.openmm_forcefield).toEqual(FORCEFIELD)
    expect(job.md_constraints).toBe(stored)
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('records a CHARMM Auto job once pae2constraints has written const.inp', async () => {
    mockWorkDir({
      'const.inp': CONST_INP,
      'model.pdb': pdbText([['MET', 'A']])
    })
    const { job, doc, mock } = makeJob({ __t: 'BilboMdAuto' })
    doc.pdb_file = 'model.pdb'

    await storeNerscMdConstraintsMidRun(job, {
      pae2constraints: 'Success',
      minimize: 'Running'
    })

    expect(downloaded()).toEqual(['const.inp', 'model.pdb'])
    expect(job.md_constraints).toEqual({
      fixed_bodies: FIXED_BODIES,
      rigid_bodies: RIGID_BODIES,
      chain_mol_types: [{ chain_id: 'A', mol_type: 'PRO' }]
    })
    expect(doc.const_inp_file).toBe('const.inp')
    expect(mock.save).toHaveBeenCalledOnce()
  })

  it('does not read an empty status.txt as a job with no PAE steps', async () => {
    mockWorkDir({ 'openmm_config.yaml': openMMConfigText() })
    const { job, mock } = makeJob({ __t: 'BilboMdAuto', md_engine: 'OpenMM' })

    await storeNerscMdConstraintsMidRun(job, {})

    expect(downloaded()).toEqual([])
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('downloads nothing once both fields are recorded', async () => {
    mockWorkDir(AF_WORKDIR)
    const { job, mock } = makeJob({
      __t: 'BilboMdAlphaFold',
      md_engine: 'OpenMM',
      md_constraints: { fixed_bodies: [], rigid_bodies: [] },
      openmm_forcefield: FORCEFIELD
    })

    await storeNerscMdConstraintsMidRun(job, { consmerge: 'Success' })

    expect(downloaded()).toEqual([])
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('downloads nothing for a classic CHARMM job, whose constraints the backend stored', async () => {
    const { job, mock } = makeJob({
      __t: 'BilboMdCRD',
      md_constraints: { fixed_bodies: [], rigid_bodies: [] }
    })

    await storeNerscMdConstraintsMidRun(job, { minimize: 'Running' })

    expect(downloaded()).toEqual([])
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('stores nothing when the PDB cannot be downloaded, so chain types are not lost', async () => {
    mockWorkDir({ 'openmm_config.yaml': AF_WORKDIR['openmm_config.yaml'] })
    const { job, mock } = makeJob({
      __t: 'BilboMdAlphaFold',
      md_engine: 'OpenMM'
    })

    await storeNerscMdConstraintsMidRun(job, { consmerge: 'Success' })

    expect(downloaded()).toEqual(['openmm_config.yaml', 'af-rank1.pdb'])
    expect(job.md_constraints).toBeUndefined()
    expect(job.openmm_forcefield).toBeUndefined()
    expect(mock.save).not.toHaveBeenCalled()
  })

  it('tolerates a download failure and leaves no temp dir behind', async () => {
    downloadNerscWorkFile.mockRejectedValue(new Error('SF API down'))
    const { job, mock } = makeJob({ __t: 'BilboMdAuto' })
    const before = (await fs.readdir(os.tmpdir())).filter((d) =>
      d.startsWith(`nersc-${UUID}-`)
    )

    await expect(
      storeNerscMdConstraintsMidRun(job, { pae2constraints: 'Success' })
    ).resolves.toBeUndefined()

    expect(mock.save).not.toHaveBeenCalled()
    const after = (await fs.readdir(os.tmpdir())).filter((d) =>
      d.startsWith(`nersc-${UUID}-`)
    )
    expect(after).toEqual(before)
  })
})
