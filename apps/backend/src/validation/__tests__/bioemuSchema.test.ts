import { describe, it, expect, vi, afterEach } from 'vitest'
import { mixed } from 'yup'

vi.mock('../helpers/fileValidators.js', () => ({
  requiredFile: (msg: string) =>
    mixed().test('required', msg, (v) => v != null && typeof v === 'object'),
  fileExtTest: () => mixed(),
  fileSizeTest: () => mixed(),
  fileNameLengthTest: () => mixed(),
  noSpacesTest: () => mixed(),
  saxsCheck: () => mixed(),
  qUnitsField: () => mixed()
}))

import {
  bioemuJobSchema,
  bioemuMaxTokens,
  countBioEmuTokens,
  BIOEMU_DEFAULT_MAX_TOKENS
} from '../bioemuSchema.js'

const protein = (sequence = 'ACDEFGHIKLM', copies = 1) => ({
  name: 'pro',
  sequence,
  type: 'Protein',
  copies
})

const job = (entities: unknown[]) => ({
  title: 'BioEmu2 test',
  bilbomd_mode: 'bioemu',
  dat_file: { originalname: 'saxs.dat', path: '/tmp/saxs.dat', size: 100 },
  entities
})

const messages = async (payload: unknown): Promise<string[]> => {
  try {
    await bioemuJobSchema.validate(payload, { abortEarly: false })
    return []
  } catch (e) {
    return (e as { errors: string[] }).errors
  }
}

afterEach(() => {
  delete process.env.BIOEMU_MAX_TOKENS
})

describe('bioemuJobSchema', () => {
  it('accepts a protein, a homodimer and a protein-DNA complex', async () => {
    expect(await messages(job([protein()]))).toEqual([])
    expect(await messages(job([protein('ACDEF', 2)]))).toEqual([])
    expect(
      await messages(
        job([
          protein(),
          { name: 'dna', sequence: 'ACGT', type: 'DNA', copies: 2 }
        ])
      )
    ).toEqual([])
  })

  it('only accepts the bioemu mode', async () => {
    expect(
      await messages({ ...job([protein()]), bilbomd_mode: 'openfold' })
    ).toContain('Invalid mode')
  })

  it('rejects RNA, which has not been benchmarked', async () => {
    expect(
      await messages(
        job([
          protein(),
          { name: 'r', sequence: 'ACGU', type: 'RNA', copies: 1 }
        ])
      )
    ).toEqual(
      expect.arrayContaining(['BioEmu2 jobs accept Protein and DNA entities'])
    )
  })

  it('needs a protein to steer', async () => {
    expect(
      await messages(
        job([{ name: 'dna', sequence: 'ACGT', type: 'DNA', copies: 1 }])
      )
    ).toContain(
      'At least one Protein entity is required (Rg steering acts on protein)'
    )
  })

  it('needs at least one entity', async () => {
    expect(await messages(job([]))).toContain('At least one entity is required')
  })

  it('rejects invalid sequences', async () => {
    expect(await messages(job([protein('ACDXZ')]))).toContain(
      'Invalid sequence for the selected molecule type'
    )
  })

  it('limits the system size, counting copies', async () => {
    const half = 'A'.repeat(BIOEMU_DEFAULT_MAX_TOKENS / 2)
    expect(await messages(job([protein(half, 2)]))).toEqual([])
    expect(await messages(job([protein(half + 'A', 2)]))).toContain(
      `The system has ${BIOEMU_DEFAULT_MAX_TOKENS + 2} residues and nucleotides (counting copies); BioEmu2 jobs are limited to ${BIOEMU_DEFAULT_MAX_TOKENS}`
    )
  })

  it('takes the size limit from BIOEMU_MAX_TOKENS', async () => {
    process.env.BIOEMU_MAX_TOKENS = '20'
    expect(bioemuMaxTokens()).toBe(20)
    expect((await messages(job([protein('A'.repeat(11), 2)])))[0]).toMatch(
      /limited to 20/
    )
  })

  it('ignores a malformed BIOEMU_MAX_TOKENS', () => {
    process.env.BIOEMU_MAX_TOKENS = 'lots'
    expect(bioemuMaxTokens()).toBe(BIOEMU_DEFAULT_MAX_TOKENS)
  })
})

describe('countBioEmuTokens', () => {
  it('multiplies each sequence by its copies', () => {
    expect(
      countBioEmuTokens([
        { sequence: 'ACDEF', copies: 2 },
        { sequence: 'ACGT', copies: 1 }
      ])
    ).toBe(14)
    expect(countBioEmuTokens()).toBe(0)
  })
})
