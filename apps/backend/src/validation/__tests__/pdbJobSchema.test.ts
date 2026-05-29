import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'

vi.mock('../helpers/fileValidators.js', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v) => v != null && typeof v === 'object'),
  fileExtTest: () => mixed(),
  fileSizeTest: () => mixed(),
  fileNameLengthTest: () => mixed(),
  noSpacesTest: () => mixed(),
  saxsCheck: () => mixed(),
  constInpCheck: () => mixed(),
  chainIdCheck: () => mixed(),
  pdbResidueCheck: () => mixed(),
  pdbOrCifExtTest: () => mixed(),
  pdbOrCifChainIdCheck: () => mixed(),
  pdbOrCifResidueCheck: () => mixed()
}))

import { pdbJobSchema } from '../pdbJobSchema.js'

const multerFile = (name = 'file.dat') => ({
  originalname: name,
  path: `/tmp/${name}`,
  size: 100
})

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('pdbJobSchema - title', () => {
  it('accepts a valid title', async () => {
    await expect(
      pdbJobSchema.validateAt('title', { title: 'My PDB Job' })
    ).resolves.toBe('My PDB Job')
  })

  it('rejects missing title', async () => {
    await expect(
      pdbJobSchema.validateAt('title', { title: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects title longer than 100 characters', async () => {
    await expect(
      pdbJobSchema.validateAt('title', { title: 'a'.repeat(101) })
    ).rejects.toThrow('too long')
  })

  it('accepts title at exactly 100 characters', async () => {
    const t = 'a'.repeat(100)
    await expect(
      pdbJobSchema.validateAt('title', { title: t })
    ).resolves.toBe(t)
  })
})

// ---------------------------------------------------------------------------
// bilbomd_mode
// ---------------------------------------------------------------------------
describe('pdbJobSchema - bilbomd_mode', () => {
  it('accepts "pdb"', async () => {
    await expect(
      pdbJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'pdb' })
    ).resolves.toBe('pdb')
  })

  it('rejects other modes', async () => {
    await expect(
      pdbJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'auto' })
    ).rejects.toBeTruthy()
    await expect(
      pdbJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'crd_psf' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing bilbomd_mode', async () => {
    await expect(
      pdbJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------
describe('pdbJobSchema - email', () => {
  it('accepts a valid email', async () => {
    await expect(
      pdbJobSchema.validateAt('email', { email: 'user@example.com' })
    ).resolves.toBe('user@example.com')
  })

  it('accepts missing email (optional)', async () => {
    await expect(
      pdbJobSchema.validateAt('email', { email: undefined })
    ).resolves.toBeUndefined()
  })

  it('rejects invalid email format', async () => {
    await expect(
      pdbJobSchema.validateAt('email', { email: 'not-an-email' })
    ).rejects.toThrow('Invalid email address')
  })
})

// ---------------------------------------------------------------------------
// required file fields
// ---------------------------------------------------------------------------
describe('pdbJobSchema - required files', () => {
  it('rejects missing dat_file', async () => {
    await expect(
      pdbJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing const_inp_file', async () => {
    await expect(
      pdbJobSchema.validateAt('const_inp_file', { const_inp_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing pdb_file', async () => {
    await expect(
      pdbJobSchema.validateAt('pdb_file', { pdb_file: undefined })
    ).rejects.toThrow('required')
  })

  it('accepts a multer file object for each file field', async () => {
    await expect(
      pdbJobSchema.validateAt('dat_file', { dat_file: multerFile('data.dat') })
    ).resolves.toBeDefined()
    await expect(
      pdbJobSchema.validateAt('const_inp_file', {
        const_inp_file: multerFile('const.inp')
      })
    ).resolves.toBeDefined()
    await expect(
      pdbJobSchema.validateAt('pdb_file', { pdb_file: multerFile('model.pdb') })
    ).resolves.toBeDefined()
    await expect(
      pdbJobSchema.validateAt('pdb_file', { pdb_file: multerFile('model.cif') })
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// rg
// ---------------------------------------------------------------------------
describe('pdbJobSchema - rg', () => {
  it('accepts values between 10 and 100', async () => {
    await expect(
      pdbJobSchema.validateAt('rg', { rg: 50 })
    ).resolves.toBe(50)
  })

  it('rejects value below 10', async () => {
    await expect(
      pdbJobSchema.validateAt('rg', { rg: 9 })
    ).rejects.toBeTruthy()
  })

  it('rejects value above 100', async () => {
    await expect(
      pdbJobSchema.validateAt('rg', { rg: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg', async () => {
    await expect(
      pdbJobSchema.validateAt('rg', { rg: undefined })
    ).rejects.toThrow('required')
  })
})

// ---------------------------------------------------------------------------
// rg_min / rg_max
// ---------------------------------------------------------------------------
describe('pdbJobSchema - rg_min', () => {
  it('accepts values between 10 and 100', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_min', { rg_min: 10 })
    ).resolves.toBe(10)
    await expect(
      pdbJobSchema.validateAt('rg_min', { rg_min: 100 })
    ).resolves.toBe(100)
  })

  it('rejects values outside 10–100', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_min', { rg_min: 9 })
    ).rejects.toBeTruthy()
    await expect(
      pdbJobSchema.validateAt('rg_min', { rg_min: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg_min', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_min', { rg_min: undefined })
    ).rejects.toThrow('required')
  })
})

describe('pdbJobSchema - rg_max', () => {
  it('accepts rg_max greater than rg_min', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 50 })
    ).resolves.toBe(50)
  })

  it('rejects rg_max equal to rg_min', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_max', { rg_min: 30, rg_max: 30 })
    ).rejects.toThrow('greater than')
  })

  it('rejects rg_max less than rg_min', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_max', { rg_min: 50, rg_max: 20 })
    ).rejects.toThrow('greater than')
  })

  it('rejects value above 100', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg_max', async () => {
    await expect(
      pdbJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: undefined })
    ).rejects.toThrow('required')
  })
})
