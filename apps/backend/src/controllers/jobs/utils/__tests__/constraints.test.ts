import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { findDisallowedConstInpLine } from '@bilbomd/bilbomd-types'

vi.mock('../../../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { materializeConstraints } from '../constraints.js'

const atom = (chain: string, resName: string, resSeq: number) =>
  `ATOM      1  CA  ${resName.padEnd(3)} ${chain}${String(resSeq).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const PDB = [
  ...Array.from({ length: 100 }, (_, i) => atom('A', 'ALA', i + 1)),
  ...Array.from({ length: 20 }, (_, i) => atom('B', 'DA', i + 1)),
  'END'
].join('\n')

const PSF = [
  'PSF EXT',
  '',
  '       3 !NATOM',
  '       1 PROA 1    ALA  CA   CT1   0.07   12.011   0',
  '       2 PROA 2    ALA  CA   CT1   0.07   12.011   0',
  '       3 HETA 1    HEM  FE   FE    0.00   55.847   0',
  ''
].join('\n')

const CONSTRAINTS = JSON.stringify({
  fixed_bodies: [
    { segments: [{ chain_id: 'A', residues: { start: 1, stop: 40 } }] }
  ],
  rigid_bodies: [{ segments: [{ chain_id: 'B' }] }]
})

const LEGACY_INP = [
  'define fixed1 sele ( resid 1:40 .and. segid PROA ) end',
  'cons fix sele fixed1 end',
  'define rigid1 sele ( segid DNAB ) end',
  'shape desc dock1 rigid sele rigid1 end',
  'return'
].join('\n')

let jobDir: string

beforeEach(async () => {
  jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'constraints-'))
  await fs.writeFile(path.join(jobDir, 'model.pdb'), PDB)
  await fs.writeFile(path.join(jobDir, 'model.psf'), PSF)
})

afterEach(async () => {
  await fs.remove(jobDir)
})

// An uploaded file as multer leaves it in the job dir
const upload = async (name: string, content: string) => {
  const filePath = path.join(jobDir, name)
  await fs.writeFile(filePath, content)
  return { originalname: name, path: filePath } as Express.Multer.File
}

const pdbArgs = () => ({
  mode: 'pdb' as const,
  jobDir,
  structureFile: path.join(jobDir, 'model.pdb')
})

describe('materializeConstraints', () => {
  it('writes const.inp for CHARMM from JSON constraints', async () => {
    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS
    })

    expect(result.ok && result.constFileName).toBe('const.inp')
    const text = await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')
    expect(text).toContain(
      'define fixed1 sele ( resid 1:40 .and. segid PROA ) end'
    )
    expect(text).toContain('define rigid1 sele ( segid DNAB ) end')
    expect(findDisallowedConstInpLine(text)).toBeNull()
    expect(result.ok && result.md_constraints.chain_mol_types).toEqual([
      { chain_id: 'A', mol_type: 'PRO' },
      { chain_id: 'B', mol_type: 'DNA' }
    ])
  })

  it('writes openmm_const.yml for OpenMM, with whole segments as ranges', async () => {
    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'OpenMM',
      constraintsField: CONSTRAINTS
    })

    expect(result.ok && result.constFileName).toBe('openmm_const.yml')
    const yaml = parseYaml(
      await fs.readFile(path.join(jobDir, 'openmm_const.yml'), 'utf8')
    )
    expect(yaml.constraints.rigid_bodies[0].segments).toEqual([
      { chain_id: 'B', residues: { start: 1, stop: 20 } }
    ])
    expect(await fs.pathExists(path.join(jobDir, 'const.inp'))).toBe(false)
  })

  it('stores the validated constraints with segids', async () => {
    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS
    })
    expect(result.ok && result.md_constraints.rigid_bodies?.[0]).toEqual({
      name: 'RigidBody1',
      segments: [
        {
          chain_id: 'B',
          segid: 'DNAB',
          residues: { start: 1, stop: 20 },
          whole_segment: true
        }
      ]
    })
  })

  it('reads an uploaded const.inp, deletes it and writes its own', async () => {
    const legacyFile = await upload('my_const.inp', LEGACY_INP)

    const fromFile = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      legacyFile
    })
    const written = await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')
    await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS
    })

    expect(fromFile.ok).toBe(true)
    expect(await fs.pathExists(legacyFile.path)).toBe(false)
    // Same constraints as JSON give the same file
    expect(await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')).toBe(
      written
    )
  })

  it.each([
    ['a system command', 'system "id"'],
    ['a stream command', 'stream other.str'],
    ['a harmonic restraint', 'cons harm force 5.0 sele fixed1 end']
  ])('rejects and deletes an uploaded const.inp with %s', async (_, line) => {
    const legacyFile = await upload(
      'const.inp',
      LEGACY_INP.replace('return', `${line}\nreturn`)
    )

    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      legacyFile
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.message).toContain(line)
    expect(await fs.pathExists(legacyFile.path)).toBe(false)
  })

  it('reads a reused openmm_const.yml (OpenMM resubmission)', async () => {
    await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'OpenMM',
      constraintsField: CONSTRAINTS
    })
    const reused = {
      originalname: 'openmm_const.yml',
      path: path.join(jobDir, 'openmm_const.yml')
    } as Express.Multer.File

    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'OpenMM',
      legacyFile: reused
    })

    expect(result.ok).toBe(true)
    expect(await fs.pathExists(reused.path)).toBe(true)
  })

  it('names CRD/PSF segments by segid', async () => {
    const result = await materializeConstraints({
      mode: 'crd_psf',
      md_engine: 'CHARMM',
      jobDir,
      structureFile: path.join(jobDir, 'model.psf'),
      constraintsField: JSON.stringify({
        fixed_bodies: [{ segments: [{ segid: 'PROA' }] }],
        rigid_bodies: [{ segments: [{ segid: 'HETA' }] }]
      })
    })

    expect(result.ok).toBe(true)
    const text = await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')
    expect(text).toContain('define rigid1 sele ( segid HETA ) end')
  })

  it.each([
    ['nothing', {}],
    ['bad JSON', { constraintsField: '{' }],
    [
      'a chain that is not in the structure',
      {
        constraintsField: JSON.stringify({
          fixed_bodies: [{ segments: [{ chain_id: 'Z' }] }]
        })
      }
    ]
  ])('rejects %s', async (_, extra) => {
    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      ...extra
    })
    expect(result.ok).toBe(false)
    expect(await fs.pathExists(path.join(jobDir, 'const.inp'))).toBe(false)
  })

  it('rejects JSON and a file together, deleting the file', async () => {
    const legacyFile = await upload('const.inp', LEGACY_INP)

    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS,
      legacyFile
    })

    expect(result.ok).toBe(false)
    expect(await fs.pathExists(legacyFile.path)).toBe(false)
  })
})
