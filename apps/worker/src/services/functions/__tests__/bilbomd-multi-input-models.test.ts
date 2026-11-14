import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import type { IMultiJob } from '@bilbomd/mongodb-schema'

const { state } = vi.hoisted(() => ({ state: { uploadDir: '' } }))

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

import { findInputModels } from '../bilbomd-multi-functions.js'

const RUN_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const RUN_B = 'bbbbbbbb-0000-0000-0000-000000000002'

const makeJob = (overrides: Partial<IMultiJob> = {}) =>
  ({
    uuid: 'multi-uuid',
    bilbomd_uuids: [RUN_A, RUN_B],
    bilbomd_jobs: [
      { uuid: RUN_A, title: 'monomer' },
      { uuid: RUN_B, title: 'dimer' }
    ],
    ...overrides
  }) as unknown as IMultiJob

// Write a conformer PDB and its FoXS profile in a run's foxs/ folder, as the
// runs a Multi job combines have them
const conformer = async (run: string, name: string, pdb = true) => {
  const profile = path.join(state.uploadDir, run, 'foxs', 'rg30', `${name}.dat`)
  await fs.outputFile(profile, '')
  if (pdb) await fs.outputFile(profile.replace(/\.dat$/, ''), 'ATOM\n')
  return profile
}

const writeList = async (profiles: string[]) =>
  fs.outputFile(
    path.join(state.uploadDir, 'multi-uuid', 'multi_md_foxs_files.txt'),
    profiles.join('\n') + '\n'
  )

beforeEach(async () => {
  state.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multi-inputs-'))
})

afterEach(async () => {
  await fs.remove(state.uploadDir)
})

describe('findInputModels', () => {
  it("takes each run's first conformer PDB, labelled by title", async () => {
    await writeList([
      await conformer(RUN_A, 'md_1.pdb'),
      await conformer(RUN_A, 'md_2.pdb'),
      await conformer(RUN_B, 'md_1.pdb')
    ])

    expect(await findInputModels(makeJob())).toEqual([
      {
        label: 'monomer (aaaaaaaa)',
        pdb: path.join(state.uploadDir, RUN_A, 'foxs', 'rg30', 'md_1.pdb')
      },
      {
        label: 'dimer (bbbbbbbb)',
        pdb: path.join(state.uploadDir, RUN_B, 'foxs', 'rg30', 'md_1.pdb')
      }
    ])
  })

  it('labels a run by its uuid when its job is not populated', async () => {
    await writeList([await conformer(RUN_A, 'md_1.pdb')])

    const models = await findInputModels(makeJob({ bilbomd_jobs: undefined }))

    expect(models.map((m) => m.label)).toEqual(['aaaaaaaa'])
  })

  it('skips a run with no profiles or a missing PDB', async () => {
    await writeList([await conformer(RUN_B, 'md_1.pdb', false)])

    expect(await findInputModels(makeJob())).toEqual([])
  })

  it('returns nothing when the profile list is missing', async () => {
    expect(await findInputModels(makeJob())).toEqual([])
  })
})
