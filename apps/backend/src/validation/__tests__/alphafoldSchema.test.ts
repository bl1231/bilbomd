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

import { alphafoldJobSchema } from '../alphafoldSchema.js'

const multerFile = (name = 'file.dat') => ({
  originalname: name,
  path: `/tmp/${name}`,
  size: 100
})

const validEntity = {
  id: 'entity-1',
  name: 'chain A',
  sequence: 'ACDEFGHIKLM',
  type: 'Protein',
  copies: 1
}

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('alphafoldJobSchema - title', () => {
  it('accepts a valid title', async () => {
    await expect(
      alphafoldJobSchema.validateAt('title', { title: 'My AF Job' })
    ).resolves.toBe('My AF Job')
  })

  it('rejects missing title', async () => {
    await expect(
      alphafoldJobSchema.validateAt('title', { title: undefined })
    ).rejects.toThrow('required')
  })

  it('rejects title longer than 100 characters', async () => {
    await expect(
      alphafoldJobSchema.validateAt('title', { title: 'a'.repeat(101) })
    ).rejects.toThrow('too long')
  })
})

// ---------------------------------------------------------------------------
// bilbomd_mode
// ---------------------------------------------------------------------------
describe('alphafoldJobSchema - bilbomd_mode', () => {
  it('accepts "alphafold"', async () => {
    await expect(
      alphafoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'alphafold' })
    ).resolves.toBe('alphafold')
  })

  it('rejects other modes', async () => {
    await expect(
      alphafoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'pdb' })
    ).rejects.toBeTruthy()
    await expect(
      alphafoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: 'auto' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing bilbomd_mode', async () => {
    await expect(
      alphafoldJobSchema.validateAt('bilbomd_mode', { bilbomd_mode: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------
describe('alphafoldJobSchema - email', () => {
  it('accepts a valid email', async () => {
    await expect(
      alphafoldJobSchema.validateAt('email', { email: 'user@example.com' })
    ).resolves.toBe('user@example.com')
  })

  it('accepts missing email (optional)', async () => {
    await expect(
      alphafoldJobSchema.validateAt('email', { email: undefined })
    ).resolves.toBeUndefined()
  })

  it('rejects invalid email format', async () => {
    await expect(
      alphafoldJobSchema.validateAt('email', { email: 'bad-email' })
    ).rejects.toThrow('Invalid email address')
  })
})

// ---------------------------------------------------------------------------
// dat_file
// ---------------------------------------------------------------------------
describe('alphafoldJobSchema - dat_file', () => {
  it('rejects missing dat_file', async () => {
    await expect(
      alphafoldJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toThrow('required')
  })

  it('accepts a multer file object', async () => {
    await expect(
      alphafoldJobSchema.validateAt('dat_file', {
        dat_file: multerFile('data.dat')
      })
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------
describe('alphafoldJobSchema - entities', () => {
  it('accepts a valid entity array', async () => {
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [validEntity] })
    ).resolves.toBeDefined()
  })

  it('rejects entity with invalid sequence characters (Protein)', async () => {
    const bad = { ...validEntity, sequence: 'ACDEFGHIKLX' }
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toThrow('Invalid amino acid sequence')
  })

  it('rejects entity with invalid type', async () => {
    const bad = { ...validEntity, type: 'Lipid' }
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toBeTruthy()
  })

  it('rejects entity with copies less than 1', async () => {
    const bad = { ...validEntity, copies: 0 }
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [bad] })
    ).rejects.toBeTruthy()
  })

  it('rejects more than 20 entities', async () => {
    const entities = Array.from({ length: 21 }, (_, i) => ({
      ...validEntity,
      id: `entity-${i}`
    }))
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities })
    ).rejects.toThrow('20 entities')
  })

  it('accepts DNA and RNA entity types (sequence must still pass amino acid regex)', async () => {
    // Backend applies the same amino acid regex to all types (no conditional logic).
    // A, C, G, T are valid amino acid codes; sequences without U pass.
    const dna = { ...validEntity, type: 'DNA', sequence: 'ACGTACGT' }
    const rna = { ...validEntity, type: 'RNA', sequence: 'ACGACG' }
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [dna] })
    ).resolves.toBeDefined()
    await expect(
      alphafoldJobSchema.validateAt('entities', { entities: [rna] })
    ).resolves.toBeDefined()
  })

  it('rejects entity missing required id', async () => {
    const bad = { ...validEntity, id: undefined }
    await expect(
      alphafoldJobSchema.validateAt('entities', {
        entities: [bad]
      })
    ).rejects.toBeTruthy()
  })
})
