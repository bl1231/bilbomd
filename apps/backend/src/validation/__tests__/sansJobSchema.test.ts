import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ValidationError } from 'yup'

// The real file validators run; only reading the uploads is mocked, so these
// tests show the SANS schema actually checks file contents
vi.mock('fs/promises', () => ({ default: { readFile: vi.fn() } }))
vi.mock('../../middleware/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import fs from 'fs/promises'
import { sansJobSchema } from '../sansJobSchema.js'

const atom = (residue: string, n: number) =>
  `ATOM      1  CA  ${residue.padEnd(3)} A${String(n).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

const GOOD_PDB = [atom('ALA', 1), atom('GLY', 2), 'END'].join('\n')
const GOOD_INP = [
  'define fixed1 sele ( resid 1:2 .and. segid PROA ) end',
  'cons fix sele fixed1 end',
  'return'
].join('\n')

let contents: Record<string, string> = {}
let uploads = 0
// Each upload gets its own path, so an override never shares contents with
// the default file payload() builds after it
const upload = (name: string, content: string) => {
  const path = `/uploads/job/${++uploads}/${name}`
  contents[path] = content
  return { originalname: name, path, size: content.length || 1 }
}

const payload = (overrides: Record<string, unknown> = {}) => ({
  title: 'SANS job',
  bilbomd_mode: 'sans',
  pdb_file: upload('protein.pdb', GOOD_PDB),
  dat_file: upload('curve.dat', '0.01 1.0 0.1\n'),
  inp_file: upload('const.inp', GOOD_INP),
  rg_min: '20',
  rg_max: '40',
  d2o_fraction: '70',
  ...overrides
})

// The first validation error for each field, as { path: message }. A
// missing file also fails its extension and size checks, so keep the first.
const errors = async (values: Record<string, unknown>) => {
  try {
    await sansJobSchema.validate(values, { abortEarly: false })
    return {}
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e
    const byPath: Record<string, string> = {}
    for (const err of e.inner) {
      if (err.path && !(err.path in byPath)) byPath[err.path] = err.message
    }
    return byPath
  }
}

beforeEach(() => {
  contents = {}
  vi.mocked(fs.readFile).mockImplementation((async (p: string) => {
    if (!(p in contents)) throw new Error('ENOENT')
    return contents[p]
  }) as never)
})

describe('sansJobSchema', () => {
  it('accepts a valid SANS job', async () => {
    expect(await errors(payload())).toEqual({})
  })

  it('requires all three files', async () => {
    const result = await errors(
      payload({ pdb_file: undefined, dat_file: undefined, inp_file: undefined })
    )
    expect(result.pdb_file).toBe('A PDB or CIF file is required')
    expect(result.dat_file).toBe('Experimental SANS data is required')
    expect(result.inp_file).toBe('const.inp file is required')
  })

  it('rejects a constraint file with a disallowed CHARMM keyword', async () => {
    const inp = GOOD_INP.replace('return', 'system "ls"\nreturn')
    expect(
      (await errors(payload({ inp_file: upload('const.inp', inp) }))).inp_file
    ).toBe('Disallowed keyword in constraint file: "system "ls""')
  })

  it('rejects more than 20 shape commands', async () => {
    const shapes = Array.from(
      { length: 21 },
      (_, i) => `shape desc dock${i} rigid sele fixed1 end`
    ).join('\n')
    const inp = GOOD_INP.replace('return', `${shapes}\nreturn`)
    expect(
      (await errors(payload({ inp_file: upload('const.inp', inp) }))).inp_file
    ).toMatch(/Too many CHARMM shape commands/)
  })

  it('rejects an empty constraint file', async () => {
    expect(
      (await errors(payload({ inp_file: upload('const.inp', '') }))).inp_file
    ).toBe('The last line must be "return".')
  })

  it('checks the structure file', async () => {
    const ensemble = [
      'MODEL        1',
      atom('ALA', 1),
      'ENDMDL',
      'MODEL        2',
      atom('ALA', 1),
      'ENDMDL'
    ].join('\n')
    expect(
      (await errors(payload({ pdb_file: upload('nmr.pdb', ensemble) })))
        .pdb_file
    ).toMatch(/multiple models/)
    expect(
      (
        await errors(
          payload({ pdb_file: upload('odd.pdb', [atom('UNK', 1)].join('\n')) })
        )
      ).pdb_file
    ).toMatch(/unsupported residues: UNK/)
  })

  it('checks file extensions', async () => {
    const result = await errors(
      payload({
        pdb_file: upload('protein.txt', GOOD_PDB),
        dat_file: upload('curve.csv', '0.01 1 0.1'),
        inp_file: upload('const.txt', GOOD_INP)
      })
    )
    expect(result.pdb_file).toMatch(/\*\.pdb or \*\.cif/)
    expect(result.dat_file).toMatch(/\*\.dat/)
    expect(result.inp_file).toMatch(/\*\.inp/)
  })

  it('needs rg_max above rg_min, both from 10 to 100', async () => {
    expect((await errors(payload({ rg_min: '40', rg_max: '40' }))).rg_max).toBe(
      'Rg Maximum must be at least 1 Å greater than Rg Minimum'
    )
    expect((await errors(payload({ rg_min: '5' }))).rg_min).toBeDefined()
    expect((await errors(payload({ rg_max: '101' }))).rg_max).toBeDefined()
  })

  it('needs a D2O percentage from 0 to 100', async () => {
    expect(
      (await errors(payload({ d2o_fraction: '101' }))).d2o_fraction
    ).toMatch(/more than 100/)
    expect(
      (await errors(payload({ d2o_fraction: '-1' }))).d2o_fraction
    ).toMatch(/less than 0/)
    expect(
      (await errors(payload({ d2o_fraction: 'lots' }))).d2o_fraction
    ).toBeDefined()
    expect(
      (await errors(payload({ d2o_fraction: undefined }))).d2o_fraction
    ).toBe('D2O Fraction is required')
  })

  it('accepts only the sans mode', async () => {
    expect(
      (await errors(payload({ bilbomd_mode: 'pdb' }))).bilbomd_mode
    ).toBeDefined()
  })
})
