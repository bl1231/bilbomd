import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import type { IJob } from '@bilbomd/mongodb-schema'

// The BioEmu2 pipeline polishes ensemble members (polish/polished.json maps
// each member to its polished copy); the ensemble PDBs must use those copies.

const { cfg } = vi.hoisted(() => ({ cfg: { uploadDir: '' } }))
vi.mock('../../../config/config.js', () => ({ config: cfg }))
vi.mock('../../../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { assembleEnsemblePdbFiles, readPolishedMap, resolveEnsemblePdbPath } =
  await import('../assemble-ensemble-pdb-file.js')

const ENSEMBLE_2 = `1 |  0.98 | x1 0.98 (1.05, -0.50)
    1   | 0.600 (0.600, 0.010) | ../foxs/rg30/bioemu_rg30_0001.pdb.dat (0.500)
   12   | 0.400 (0.400, 0.010) | ../foxs/rg38/bioemu_rg38_0012.pdb.dat (0.200)
`

let uploadDir: string
let jobDir: string

beforeEach(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ensemble-'))
  cfg.uploadDir = uploadDir
  jobDir = path.join(uploadDir, 'uuid-1')
  await fs.outputFile(
    path.join(jobDir, 'multifoxs', 'ensembles_size_2.txt'),
    ENSEMBLE_2
  )
  await fs.outputFile(
    path.join(jobDir, 'foxs', 'rg30', 'bioemu_rg30_0001.pdb'),
    'RAW30\nEND\n'
  )
  await fs.outputFile(
    path.join(jobDir, 'foxs', 'rg38', 'bioemu_rg38_0012.pdb'),
    'RAW38\nEND\n'
  )
  await fs.ensureDir(path.join(jobDir, 'results'))
})

afterEach(async () => {
  await fs.remove(uploadDir)
})

const makeJob = () =>
  ({
    uuid: 'uuid-1',
    __t: 'BilboMdBioEmu',
    save: vi.fn()
  }) as unknown as IJob

describe('resolveEnsemblePdbPath', () => {
  it('resolves MultiFoXS-relative and container paths into the job dir', () => {
    expect(resolveEnsemblePdbPath('../foxs/rg30/a.pdb', jobDir)).toBe(
      path.join(jobDir, 'foxs', 'rg30', 'a.pdb')
    )
    expect(
      resolveEnsemblePdbPath('/bilbomd/work/foxs/rg30/a.pdb', jobDir)
    ).toBe(path.join(jobDir, 'foxs', 'rg30', 'a.pdb'))
  })
})

describe('readPolishedMap', () => {
  it('is empty when the job was not polished', async () => {
    expect(await readPolishedMap(jobDir)).toEqual({})
  })

  it('drops entries whose polished file is missing', async () => {
    const a = path.join(jobDir, 'polish', 'a.pdb')
    await fs.outputFile(a, 'x')
    await fs.outputJson(path.join(jobDir, 'polish', 'polished.json'), {
      m1: a,
      m2: path.join(jobDir, 'polish', 'gone.pdb')
    })
    expect(await readPolishedMap(jobDir)).toEqual({ m1: a })
  })

  it('ignores an unreadable map', async () => {
    await fs.outputFile(path.join(jobDir, 'polish', 'polished.json'), '{oops')
    expect(await readPolishedMap(jobDir)).toEqual({})
  })
})

describe('assembleEnsemblePdbFiles with polished members', () => {
  it('uses the polished copy where there is one', async () => {
    const polished = path.join(jobDir, 'polish', 'rg30_bioemu_rg30_0001.pdb')
    await fs.outputFile(polished, 'POLISHED30\nEND\n')
    await fs.outputJson(path.join(jobDir, 'polish', 'polished.json'), {
      [path.join(jobDir, 'foxs', 'rg30', 'bioemu_rg30_0001.pdb')]: polished
    })
    const job = makeJob()

    await assembleEnsemblePdbFiles({ DBjob: job })

    const out = await fs.readFile(
      path.join(jobDir, 'results', 'ensemble_size_2_model.pdb'),
      'utf8'
    )
    expect(out).toContain('POLISHED30')
    expect(out).not.toContain('RAW30')
    expect(out).toContain('RAW38') // not polished: the original is used
    expect(job.results?.bioemu?.total_num_ensembles).toBe(2)
  })

  it('prefers the superposed copy over the polished one', async () => {
    const raw30 = path.join(jobDir, 'foxs', 'rg30', 'bioemu_rg30_0001.pdb')
    const raw38 = path.join(jobDir, 'foxs', 'rg38', 'bioemu_rg38_0012.pdb')
    const polished = path.join(jobDir, 'polish', 'rg30_bioemu_rg30_0001.pdb')
    const aligned30 = path.join(jobDir, 'align', 'rg30_bioemu_rg30_0001.pdb')
    await fs.outputFile(polished, 'POLISHED30\nEND\n')
    await fs.outputFile(aligned30, 'ALIGNED30\nEND\n')
    await fs.outputJson(path.join(jobDir, 'polish', 'polished.json'), {
      [raw30]: polished
    })
    // rg38's superposed copy is listed but missing: fall back to the original
    await fs.outputJson(path.join(jobDir, 'align', 'aligned.json'), {
      [raw30]: aligned30,
      [raw38]: path.join(jobDir, 'align', 'missing.pdb')
    })

    await assembleEnsemblePdbFiles({ DBjob: makeJob() })

    const out = await fs.readFile(
      path.join(jobDir, 'results', 'ensemble_size_2_model.pdb'),
      'utf8'
    )
    expect(out).toContain('ALIGNED30')
    expect(out).not.toContain('POLISHED30')
    expect(out).toContain('RAW38')
  })

  it('uses the originals when nothing was polished', async () => {
    await assembleEnsemblePdbFiles({ DBjob: makeJob() })
    const out = await fs.readFile(
      path.join(jobDir, 'results', 'ensemble_size_2_model.pdb'),
      'utf8'
    )
    expect(out).toContain('RAW30')
    expect(out).toContain('RAW38')
  })
})
