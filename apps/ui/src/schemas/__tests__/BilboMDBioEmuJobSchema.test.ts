import { describe, it, expect, vi } from 'vitest'
import { mixed } from 'yup'
import {
  makeBilboMDBioEmuJobSchema,
  BIOEMU_DEFAULT_MAX_TOKENS
} from '../BilboMDBioEmuJobSchema'

vi.mock('../fieldTests/fieldTests', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v: unknown) => v != null),
  fileSizeTest: () => mixed(),
  fileExtTest: () => mixed(),
  saxsCheck: () => mixed(),
  qUnitsField: () => mixed(),
  noSpacesTest: () => mixed(),
  fileNameLengthTest: () => mixed()
}))

const protein = (sequence = 'ACDEFGHIKLM', copies = 1) => ({
  name: 'pro-1',
  sequence,
  type: 'Protein',
  copies
})
const dna = { name: 'dna-2', sequence: 'ACGTACGTACGT', type: 'DNA', copies: 2 }

const job = (entities: unknown[]) => ({
  title: 'Test Job',
  dat_file: 'data.dat',
  entities
})

const errorsFor = async (
  payload: unknown,
  schema = makeBilboMDBioEmuJobSchema()
): Promise<string[]> => {
  try {
    await schema.validate(payload, { abortEarly: false })
    return []
  } catch (e) {
    return (e as { errors: string[] }).errors
  }
}

describe('makeBilboMDBioEmuJobSchema', () => {
  it('accepts proteins and protein-DNA complexes', async () => {
    expect(await errorsFor(job([protein()]))).toEqual([])
    expect(await errorsFor(job([protein('ACDEFGHIKL', 2), dna]))).toEqual([])
  })

  it('rejects RNA', async () => {
    expect(
      await errorsFor(
        job([protein(), { ...dna, type: 'RNA', sequence: 'ACGUACGUACGU' }])
      )
    ).toContain('BioEmu2 jobs take Protein and DNA')
  })

  it('needs a protein for the Rg steering', async () => {
    expect(await errorsFor(job([dna]))).toContain(
      'At least one Protein entity is required: the Rg steering acts on protein.'
    )
  })

  it('applies the default size limit, counting copies', async () => {
    const half = 'A'.repeat(BIOEMU_DEFAULT_MAX_TOKENS / 2)
    expect(await errorsFor(job([protein(half, 2)]))).toEqual([])
    expect(await errorsFor(job([protein(half + 'A', 2)]))).toContain(
      `The system has ${BIOEMU_DEFAULT_MAX_TOKENS + 2} residues and nucleotides (counting copies). BioEmu2 jobs are limited to ${BIOEMU_DEFAULT_MAX_TOKENS}.`
    )
  })

  it("uses the deployment's limit when given one", async () => {
    const errors = await errorsFor(
      job([protein('A'.repeat(30), 1)]),
      makeBilboMDBioEmuJobSchema(20)
    )
    expect(errors.join(' ')).toMatch(/limited to 20/)
  })

  it('rejects invalid DNA characters', async () => {
    expect(
      await errorsFor(job([protein(), { ...dna, sequence: 'ACGUACGUACGU' }]))
    ).toContain('Invalid character for the selected molecule type.')
  })
})
