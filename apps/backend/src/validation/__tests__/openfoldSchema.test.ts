import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'

vi.mock('../helpers/fileValidators.js', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v) => v != null && typeof v === 'object'),
  fileExtTest: () => mixed(),
  fileSizeTest: () => mixed(),
  fileNameLengthTest: () => mixed(),
  noSpacesTest: () => mixed(),
  saxsCheck: () => mixed()
}))

import { openfoldJobSchema } from '../openfoldSchema.js'

const multerFile = (name = 'file.dat') => ({
  originalname: name,
  path: `/tmp/${name}`,
  size: 100
})

const validProteinEntity = {
  name: 'pro-1',
  sequence: 'ACDEFGHIKLM',
  type: 'Protein',
  copies: 1
}

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('openfoldJobSchema - title', () => {
  it('accepts a valid title', async () => {
    await expect(
      openfoldJobSchema.validateAt('title', { title: 'My OF3 Job' })
    ).resolves.toBe('My OF3 Job')
  })

  it('rejects missing title', async () => {
    await expect(
      openfoldJobSchema.validateAt('title', { title: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects title longer than 100 characters', async () => {
    await expect(
      openfoldJobSchema.validateAt('title', { title: 'a'.repeat(101) })
    ).rejects.toThrow('too long')
  })
})

// ---------------------------------------------------------------------------
// bilbomd_mode
// ---------------------------------------------------------------------------
describe('openfoldJobSchema - bilbomd_mode', () => {
  it('accepts "openfold"', async () => {
    await expect(
      openfoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'openfold' })
    ).resolves.toBe('openfold')
  })

  it('rejects other modes', async () => {
    await expect(
      openfoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'pdb' })
    ).rejects.toBeTruthy()
    await expect(
      openfoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'alphafold' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing bilbomd_mode', async () => {
    await expect(
      openfoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------
describe('openfoldJobSchema - email', () => {
  it('accepts a valid email', async () => {
    await expect(
      openfoldJobSchema.validateAt('email', { email: 'user@example.com' })
    ).resolves.toBe('user@example.com')
  })

  it('accepts missing email (optional)', async () => {
    await expect(
      openfoldJobSchema.validateAt('email', { email: undefined })
    ).resolves.toBeUndefined()
  })

  it('rejects invalid email format', async () => {
    await expect(
      openfoldJobSchema.validateAt('email', { email: 'bad-email' })
    ).rejects.toThrow('Invalid email address')
  })
})

// ---------------------------------------------------------------------------
// dat_file
// ---------------------------------------------------------------------------
describe('openfoldJobSchema - dat_file', () => {
  it('rejects missing dat_file', async () => {
    await expect(
      openfoldJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toThrow('required')
  })

  it('accepts a multer file object', async () => {
    await expect(
      openfoldJobSchema.validateAt('dat_file', {
        dat_file: multerFile('data.dat')
      })
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------
describe('openfoldJobSchema - entities', () => {
  it('accepts a valid protein entity without id (id is a UI-only field)', async () => {
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [validProteinEntity] })
    ).resolves.toBeDefined()
  })

  it('accepts DNA entity with valid DNA sequence', async () => {
    const dna = { name: 'dna-1', sequence: 'ACGTACGT', type: 'DNA', copies: 1 }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [dna] })
    ).resolves.toBeDefined()
  })

  it('accepts RNA entity with valid RNA sequence', async () => {
    const rna = { name: 'rna-1', sequence: 'ACGUACGU', type: 'RNA', copies: 1 }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [rna] })
    ).resolves.toBeDefined()
  })

  it('rejects entity with invalid protein sequence characters', async () => {
    const bad = { ...validProteinEntity, sequence: 'ACDEFGHIKLX' }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toThrow('Invalid sequence')
  })

  it('rejects entity with invalid DNA sequence characters', async () => {
    const bad = { name: 'dna-1', sequence: 'ACGTX', type: 'DNA', copies: 1 }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toThrow('Invalid sequence')
  })

  it('rejects entity with invalid type', async () => {
    const bad = { ...validProteinEntity, type: 'Lipid' }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toBeTruthy()
  })

  it('rejects entity with copies less than 1', async () => {
    const bad = { ...validProteinEntity, copies: 0 }
    await expect(
      openfoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toBeTruthy()
  })

  it('rejects more than 20 entities', async () => {
    const entities = Array.from({ length: 21 }, () => ({ ...validProteinEntity }))
    await expect(
      openfoldJobSchema.validateAt('entities', { entities })
    ).rejects.toThrow('20 entities')
  })
})
