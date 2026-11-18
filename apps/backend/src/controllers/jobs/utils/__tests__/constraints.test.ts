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

const EXAMPLE_INP = [
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

  it("reads the example data's const.inp, deletes it and writes its own", async () => {
    const exampleConstInp = await upload('example-const.inp', EXAMPLE_INP)

    const fromFile = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      exampleConstInp
    })
    const written = await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')
    await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS
    })

    expect(fromFile.ok).toBe(true)
    expect(await fs.pathExists(exampleConstInp.path)).toBe(false)
    // Same constraints as JSON give the same file
    expect(await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')).toBe(
      written
    )
  })

  it('fails safely, deleting it, if an example const.inp cannot be read', async () => {
    const exampleConstInp = await upload(
      'example-const.inp',
      EXAMPLE_INP.replace('return', 'system "id"\nreturn')
    )

    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      exampleConstInp
    })

    expect(result.ok).toBe(false)
    expect(await fs.pathExists(exampleConstInp.path)).toBe(false)
    expect(await fs.pathExists(path.join(jobDir, 'const.inp'))).toBe(false)
  })

  // Protein chain a is CHARMM segment PROA; DNA chain A is DNAA. Reading a
  // const.inp must find chain a again, not guess A from PROA.
  it('reads a const.inp for a lowercase chain back unchanged', async () => {
    await fs.writeFile(
      path.join(jobDir, 'mixed.pdb'),
      [
        ...Array.from({ length: 50 }, (_, i) => atom('a', 'ALA', i + 1)),
        ...Array.from({ length: 20 }, (_, i) => atom('A', 'DA', i + 1)),
        'END'
      ].join('\n')
    )
    const args = {
      ...pdbArgs(),
      md_engine: 'CHARMM' as const,
      structureFile: path.join(jobDir, 'mixed.pdb')
    }
    const original = await materializeConstraints({
      ...args,
      constraintsField: JSON.stringify({
        fixed_bodies: [
          { segments: [{ chain_id: 'a', residues: { start: 1, stop: 20 } }] }
        ],
        rigid_bodies: [{ segments: [{ chain_id: 'A' }] }]
      })
    })
    const written = await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')
    expect(written).toContain('segid PROA')
    expect(written).toContain('segid DNAA')

    const reused = await materializeConstraints({
      ...args,
      exampleConstInp: {
        originalname: 'const.inp',
        path: path.join(jobDir, 'const.inp')
      } as Express.Multer.File
    })

    expect(reused.ok).toBe(true)
    expect(reused.ok && reused.md_constraints).toEqual(
      original.ok && original.md_constraints
    )
    expect(await fs.readFile(path.join(jobDir, 'const.inp'), 'utf8')).toBe(
      written
    )
  })

  it('stores CRD/PSF segments under the chain the result PDBs use', async () => {
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

    // writeSegidToChainid puts the segid's last character in the chain column
    expect(
      result.ok && result.md_constraints.fixed_bodies?.[0]?.segments[0]
    ).toMatchObject({ chain_id: 'A', segid: 'PROA' })
    expect(result.ok && result.md_constraints.chain_mol_types).toEqual([
      { chain_id: 'A', mol_type: 'PRO' }
    ])
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

  it('uses JSON sent with example data, deleting the example file', async () => {
    const exampleConstInp = await upload('example-const.inp', EXAMPLE_INP)

    const result = await materializeConstraints({
      ...pdbArgs(),
      md_engine: 'CHARMM',
      constraintsField: CONSTRAINTS,
      exampleConstInp
    })

    expect(result.ok).toBe(true)
    expect(await fs.pathExists(exampleConstInp.path)).toBe(false)
  })
})
