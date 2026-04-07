import { describe, it, expect, vi } from 'vitest'
import { BilboMDAutoJobSchema } from '../BilboMDAutoJobSchema'

// Mock heavy validators to simplify unit tests
vi.mock('../ValidationFunctions', () => ({
  noSpaces: () => true,
  isSaxsData: async () => ({ valid: true }),
  isValidConstInpFile: async () => true,
  hasAllowedResiduesOnly: async () => ({
    valid: true,
    unsupportedResidues: []
  }),
  isPsfData: async () => true,
  isCRD: async () => true,
  containsChainId: async () => true,
  noLeadingSpaceOnPDBLines: async () => true
}))

const makeFile = (name: string, size = 100, content = 'x'): File => {
  const repeated = content.repeat(Math.max(1, size))
  const blob = new Blob([repeated], { type: 'text/plain' })
  const file = new File([blob], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    repeated
  return file
}

const makeJsonFile = (name: string, size = 100): File => {
  const content = JSON.stringify({ pae: [] })
  const blob = new Blob([content], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })
  Object.defineProperty(file, 'size', { value: size })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  return file
}

// ---------------------------------------------------------------------------
// md_engine
// ---------------------------------------------------------------------------
describe('BilboMDAutoJobSchema - md_engine', () => {
  it('allows charmm and openmm', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'charmm' })
    ).resolves.toBe('charmm')
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'openmm' })
    ).resolves.toBe('openmm')
    await expect(
      BilboMDAutoJobSchema.validateAt('md_engine', { md_engine: 'invalid' })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// title
// ---------------------------------------------------------------------------
describe('BilboMDAutoJobSchema - title', () => {
  it('accepts valid title', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'Good Job' })
    ).resolves.toBe('Good Job')
  })

  it('rejects title shorter than 4 characters', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'abc' })
    ).rejects.toThrow('at least 4 characters')
  })

  it('rejects title longer than 30 characters', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'a'.repeat(31) })
    ).rejects.toThrow('less than 30 characters')
  })

  it('accepts title at exactly 4 and 30 characters', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'abcd' })
    ).resolves.toBe('abcd')
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'a'.repeat(30) })
    ).resolves.toBe('a'.repeat(30))
  })

  it('rejects title with special characters', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: 'Bad@Job!' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing title', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('title', { title: undefined })
    ).rejects.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// pdb_file
// ---------------------------------------------------------------------------
describe('BilboMDAutoJobSchema - pdb_file', () => {
  it('accepts valid .pdb file', async () => {
    const file = makeFile('model.pdb')
    await expect(
      BilboMDAutoJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).resolves.toBe(file)
  })

  it('rejects missing pdb_file', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('pdb_file', { pdb_file: undefined })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.pdb extension', async () => {
    const file = makeFile('model.txt')
    await expect(
      BilboMDAutoJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('Only accepts a *.pdb')
  })

  it('rejects file exceeding 10MB', async () => {
    const file = makeFile('model.pdb', 10_000_001)
    await expect(
      BilboMDAutoJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('Max file size')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.pdb')
    await expect(
      BilboMDAutoJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })

  // noSpaces is mocked to always return true above, so space rejection
  // is covered by fieldTests/__tests__/fieldTests.test.ts instead.
})

// ---------------------------------------------------------------------------
// pae_file
// ---------------------------------------------------------------------------
describe('BilboMDAutoJobSchema - pae_file', () => {
  it('accepts valid .json file with valid JSON content', async () => {
    const file = makeJsonFile('pae.json')
    await expect(
      BilboMDAutoJobSchema.validateAt('pae_file', { pae_file: file })
    ).resolves.toBe(file)
  })

  it('rejects missing pae_file', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('pae_file', { pae_file: undefined })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.json extension', async () => {
    const file = makeJsonFile('pae.txt')
    await expect(
      BilboMDAutoJobSchema.validateAt('pae_file', { pae_file: file })
    ).rejects.toThrow('json')
  })

  it('rejects file exceeding 120MB', async () => {
    const file = makeJsonFile('pae.json', 120_000_001)
    await expect(
      BilboMDAutoJobSchema.validateAt('pae_file', { pae_file: file })
    ).rejects.toThrow('Max file size')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeJsonFile('a'.repeat(27) + '.json', 100)
    await expect(
      BilboMDAutoJobSchema.validateAt('pae_file', { pae_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })
})

// ---------------------------------------------------------------------------
// dat_file
// ---------------------------------------------------------------------------
describe('BilboMDAutoJobSchema - dat_file', () => {
  it('accepts valid .dat file', async () => {
    const file = makeFile('data.dat')
    await expect(
      BilboMDAutoJobSchema.validateAt('dat_file', { dat_file: file })
    ).resolves.toBe(file)
  })

  it('rejects missing dat_file', async () => {
    await expect(
      BilboMDAutoJobSchema.validateAt('dat_file', { dat_file: undefined })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.dat extension', async () => {
    const file = makeFile('data.txt')
    await expect(
      BilboMDAutoJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('dat')
  })

  it('rejects file exceeding 2MB', async () => {
    const file = makeFile('data.dat', 2_000_001)
    await expect(
      BilboMDAutoJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('Max file size')
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.dat')
    await expect(
      BilboMDAutoJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toThrow('no longer than 30 characters')
  })
})
