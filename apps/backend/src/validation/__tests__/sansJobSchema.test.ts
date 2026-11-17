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
  rg_min: '20',
  rg_max: '40',
  d2o_fraction: '70',
  deuteration_fractions: { A: 50 },
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

  // Constraints are validated against the structure by the handler
  // (materializeConstraints), not by this schema
  it('requires both files', async () => {
    const result = await errors(
      payload({ pdb_file: undefined, dat_file: undefined })
    )
    expect(result.pdb_file).toBe('A PDB or CIF file is required')
    expect(result.dat_file).toBe('Experimental SANS data is required')
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
        dat_file: upload('curve.csv', '0.01 1 0.1')
      })
    )
    expect(result.pdb_file).toMatch(/\*\.pdb or \*\.cif/)
    expect(result.dat_file).toMatch(/\*\.dat/)
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

  it('needs at least one chain deuteration fraction', async () => {
    const message =
      'At least one deuteration_fraction_<chainId> field is required'
    expect(
      (await errors(payload({ deuteration_fractions: {} })))
        .deuteration_fractions
    ).toBe(message)
    expect(
      (await errors(payload({ deuteration_fractions: undefined })))
        .deuteration_fractions
    ).toBe(message)
  })

  it('needs each deuteration fraction from 0 to 100', async () => {
    const fractionError = async (fraction: number) =>
      (await errors(payload({ deuteration_fractions: { A: 0, B: fraction } })))
        .deuteration_fractions
    expect(await fractionError(0)).toBeUndefined()
    expect(await fractionError(100)).toBeUndefined()
    expect(await fractionError(101)).toBe(
      'Deuteration fraction for chain B must be a number from 0 to 100'
    )
    expect(await fractionError(-1)).toBeDefined()
    expect(await fractionError(NaN)).toBeDefined()
  })

  it('rejects malformed chain IDs', async () => {
    expect(
      (await errors(payload({ deuteration_fractions: { 'A.$b': 10 } })))
        .deuteration_fractions
    ).toBe('Invalid chain ID "A.$b"')
    expect(
      (await errors(payload({ deuteration_fractions: { ABCDE: 10 } })))
        .deuteration_fractions
    ).toBeDefined()
  })

  it('accepts only the sans mode', async () => {
    expect(
      (await errors(payload({ bilbomd_mode: 'pdb' }))).bilbomd_mode
    ).toBeDefined()
  })
})
