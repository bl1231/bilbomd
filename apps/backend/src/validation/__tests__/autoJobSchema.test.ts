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
  jsonFileCheck: () => mixed(),
  chainIdCheck: () => mixed(),
  pdbResidueCheck: () => mixed()
}))

import { autoJobSchema } from '../autoJobSchema.js'

const multerFile = (name = 'file.dat') => ({
  originalname: name,
  path: `/tmp/${name}`,
  size: 100
})

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('autoJobSchema - title', () => {
  it('accepts a valid title', async () => {
    await expect(
      autoJobSchema.validateAt('title', { title: 'My Auto Job' })
    ).resolves.toBe('My Auto Job')
  })

  it('rejects missing title', async () => {
    await expect(
      autoJobSchema.validateAt('title', { title: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects title longer than 100 characters', async () => {
    await expect(
      autoJobSchema.validateAt('title', { title: 'a'.repeat(101) })
    ).rejects.toThrow('too long')
  })
})

// ---------------------------------------------------------------------------
// bilbomd_mode
// ---------------------------------------------------------------------------
describe('autoJobSchema - bilbomd_mode', () => {
  it('accepts "auto"', async () => {
    await expect(
      autoJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'auto' })
    ).resolves.toBe('auto')
  })

  it('rejects other modes', async () => {
    await expect(
      autoJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'pdb' })
    ).rejects.toBeTruthy()
    await expect(
      autoJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'alphafold' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing bilbomd_mode', async () => {
    await expect(
      autoJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------
describe('autoJobSchema - email', () => {
  it('accepts a valid email', async () => {
    await expect(
      autoJobSchema.validateAt('email', { email: 'user@example.com' })
    ).resolves.toBe('user@example.com')
  })

  it('accepts missing email (optional)', async () => {
    await expect(
      autoJobSchema.validateAt('email', { email: undefined })
    ).resolves.toBeUndefined()
  })

  it('rejects invalid email format', async () => {
    await expect(
      autoJobSchema.validateAt('email', { email: 'not-an-email' })
    ).rejects.toThrow('Invalid email address')
  })
})

// ---------------------------------------------------------------------------
// required file fields
// ---------------------------------------------------------------------------
describe('autoJobSchema - required files', () => {
  it('rejects missing pdb_file', async () => {
    await expect(
      autoJobSchema.validateAt('pdb_file', { pdb_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing pae_file', async () => {
    await expect(
      autoJobSchema.validateAt('pae_file', { pae_file: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects missing dat_file', async () => {
    await expect(
      autoJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toThrow('required')
  })

  it('accepts a multer file object for each file field', async () => {
    await expect(
      autoJobSchema.validateAt('pdb_file', { pdb_file: multerFile('model.pdb') })
    ).resolves.toBeDefined()
    await expect(
      autoJobSchema.validateAt('pae_file', { pae_file: multerFile('pae.json') })
    ).resolves.toBeDefined()
    await expect(
      autoJobSchema.validateAt('dat_file', { dat_file: multerFile('data.dat') })
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// rg / rg_min / rg_max
// ---------------------------------------------------------------------------
describe('autoJobSchema - rg', () => {
  it('accepts values between 10 and 100', async () => {
    await expect(autoJobSchema.validateAt('rg', { rg: 50 })).resolves.toBe(50)
  })

  it('rejects values outside 10–100', async () => {
    await expect(
      autoJobSchema.validateAt('rg', { rg: 9 })
    ).rejects.toBeTruthy()
    await expect(
      autoJobSchema.validateAt('rg', { rg: 101 })
    ).rejects.toBeTruthy()
  })

  it('rejects missing rg', async () => {
    await expect(
      autoJobSchema.validateAt('rg', { rg: undefined })
    ).rejects.toThrow('required')
  })
})

describe('autoJobSchema - rg_min / rg_max', () => {
  it('accepts rg_min and rg_max in range', async () => {
    await expect(
      autoJobSchema.validateAt('rg_min', { rg_min: 20 })
    ).resolves.toBe(20)
    await expect(
      autoJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: 50 })
    ).resolves.toBe(50)
  })

  it('rejects rg_max not greater than rg_min', async () => {
    await expect(
      autoJobSchema.validateAt('rg_max', { rg_min: 30, rg_max: 30 })
    ).rejects.toThrow('greater than')
    await expect(
      autoJobSchema.validateAt('rg_max', { rg_min: 50, rg_max: 20 })
    ).rejects.toThrow('greater than')
  })

  it('rejects missing rg_min and rg_max', async () => {
    await expect(
      autoJobSchema.validateAt('rg_min', { rg_min: undefined })
    ).rejects.toThrow('required')
    await expect(
      autoJobSchema.validateAt('rg_max', { rg_min: 20, rg_max: undefined })
    ).rejects.toThrow('required')
  })
})
