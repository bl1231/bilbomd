import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'
import { BilboMDAlphaFoldJobSchema } from '../BilboMDAlphaFoldJobSchema'

vi.mock('../fieldTests/fieldTests', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v: unknown) => v != null),
  fileSizeTest: () => mixed(),
  fileExtTest: () => mixed(),
  saxsCheck: () => mixed(),
  noSpacesTest: () => mixed(),
  fileNameLengthTest: () => mixed()
}))

const validEntity = {
  name: 'chain A',
  sequence: 'ACDEFGHIKLM',
  type: 'Protein',
  copies: 1
}

const validBase = {
  md_engine: 'charmm',
  title: 'Test Job',
  dat_file: 'data.dat',
  entities: [validEntity]
}

describe('BilboMDAlphaFoldJobSchema - md_engine', () => {
  it('accepts charmm and openmm', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('md_engine', {
        md_engine: 'charmm'
      })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('md_engine', {
        md_engine: 'openmm'
      })
    ).resolves.toBe('openmm')
  })

  it('rejects invalid md_engine', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('md_engine', {
        md_engine: 'invalid'
      })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDAlphaFoldJobSchema - title', () => {
  it('accepts valid title', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('title', { title: 'Good Title' })
    ).resolves.toBe('Good Title')
  })

  it('rejects title shorter than 4 characters', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('title', { title: 'abc' })
    ).rejects.toBeTruthy()
  })

  it('rejects title longer than 30 characters', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('title', {
        title: 'a'.repeat(31)
      })
    ).rejects.toBeTruthy()
  })

  it('rejects title with special characters', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('title', { title: 'Bad@Title!' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing title', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.validateAt('title', { title: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('BilboMDAlphaFoldJobSchema - entities', () => {
  it('accepts valid entity array', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.isValid(validBase)
    ).resolves.toBe(true)
  })

  it('rejects empty entities array', async () => {
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({ ...validBase, entities: [] })
    ).resolves.toBe(false)
  })

  it('rejects entity with sequence shorter than 10 characters', async () => {
    const shortSeq = { ...validEntity, sequence: 'ACDEFG' }
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [shortSeq]
      })
    ).resolves.toBe(false)
  })

  it('rejects entity with invalid type', async () => {
    const badType = { ...validEntity, type: 'Lipid' }
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [badType]
      })
    ).resolves.toBe(false)
  })

  it('accepts DNA and RNA types without amino acid check', async () => {
    const dnaEntity = {
      ...validEntity,
      type: 'DNA',
      sequence: 'ACGTACGTAC'
    }
    const rnaEntity = {
      ...validEntity,
      type: 'RNA',
      sequence: 'ACGUACGUAC'
    }
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [dnaEntity]
      })
    ).resolves.toBe(true)
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [rnaEntity]
      })
    ).resolves.toBe(true)
  })

  it('rejects Protein entity with non-amino-acid characters', async () => {
    const badSeq = { ...validEntity, sequence: 'ACDEFGHIKLX' }
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [badSeq]
      })
    ).resolves.toBe(false)
  })

  it('rejects entity with copies less than 1', async () => {
    const zeroCopies = { ...validEntity, copies: 0 }
    await expect(
      BilboMDAlphaFoldJobSchema.isValid({
        ...validBase,
        entities: [zeroCopies]
      })
    ).resolves.toBe(false)
  })
})
