import { describe, it, expect } from 'vitest'
import { bilbomdScoperJobSchema } from '../ScoperValidationSchema'

vi.mock('../ValidationFunctions', () => ({
  noSpaces: async () => true,
  isSaxsData: async () => ({ valid: true }),
  isRNA: async () => ({ valid: true })
}))

const makeFile = (
  name: string,
  size = 100,
  type = 'text/plain'
): File => {
  const blob = new Blob(['x'.repeat(size)], { type })
  const file = new File([blob], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('bilbomdScoperJobSchema - title', () => {
  it('accepts valid title', async () => {
    await expect(
      bilbomdScoperJobSchema.validateAt('title', { title: 'Valid Title' })
    ).resolves.toBe('Valid Title')
  })

  it('rejects title shorter than 4 characters', async () => {
    await expect(
      bilbomdScoperJobSchema.validateAt('title', { title: 'ab' })
    ).rejects.toBeTruthy()
  })

  it('rejects title longer than 30 characters', async () => {
    await expect(
      bilbomdScoperJobSchema.validateAt('title', { title: 'a'.repeat(31) })
    ).rejects.toBeTruthy()
  })

  it('rejects title with special characters', async () => {
    await expect(
      bilbomdScoperJobSchema.validateAt('title', { title: 'Bad@Title!' })
    ).rejects.toBeTruthy()
  })

  it('rejects missing title', async () => {
    await expect(
      bilbomdScoperJobSchema.validateAt('title', { title: undefined })
    ).rejects.toBeTruthy()
  })
})

describe('bilbomdScoperJobSchema - pdb_file', () => {
  it('accepts valid .pdb file under size limit', async () => {
    const file = makeFile('rna.pdb', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).resolves.toBe(file)
  })

  it('rejects file exceeding 20MB', async () => {
    const file = makeFile('rna.pdb', 20_000_001)
    await expect(
      bilbomdScoperJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.pdb extension', async () => {
    const file = makeFile('rna.txt', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toBeTruthy()
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.pdb', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('pdb_file', { pdb_file: file })
    ).rejects.toBeTruthy()
  })

})

describe('bilbomdScoperJobSchema - dat_file', () => {
  it('accepts valid .dat file under size limit', async () => {
    const file = makeFile('data.dat', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('dat_file', { dat_file: file })
    ).resolves.toBe(file)
  })

  it('rejects file exceeding 3MB', async () => {
    const file = makeFile('data.dat', 3_000_001)
    await expect(
      bilbomdScoperJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.dat extension', async () => {
    const file = makeFile('data.txt', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toBeTruthy()
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.dat', 100)
    await expect(
      bilbomdScoperJobSchema.validateAt('dat_file', { dat_file: file })
    ).rejects.toBeTruthy()
  })
})
