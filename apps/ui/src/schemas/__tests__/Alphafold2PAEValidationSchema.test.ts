import { describe, it, expect } from 'vitest'
import { af2paeJiffySchema } from '../Alphafold2PAEValidationSchema'

vi.mock('../ValidationFunctions', () => ({
  noSpaces: async () => true
}))

const makeFile = (
  name: string,
  size = 100,
  type = 'text/plain',
  content = 'x'
): File => {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  return file
}

const validPdb = makeFile('model.pdb', 100)
const validPae = makeFile('pae.json', 100, 'application/json', '{"a":1}')

describe('af2paeJiffySchema - pdb_file', () => {
  it('accepts valid .pdb file', async () => {
    await expect(
      af2paeJiffySchema.validateAt('pdb_file', {
        pdb_file: validPdb,
        pae_file: validPae
      })
    ).resolves.toBe(validPdb)
  })

  it('rejects file exceeding 20MB', async () => {
    const file = makeFile('model.pdb', 20_000_001)
    await expect(
      af2paeJiffySchema.validateAt('pdb_file', {
        pdb_file: file,
        pae_file: validPae
      })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.pdb extension', async () => {
    const file = makeFile('model.txt', 100)
    await expect(
      af2paeJiffySchema.validateAt('pdb_file', {
        pdb_file: file,
        pae_file: validPae
      })
    ).rejects.toBeTruthy()
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.pdb', 100)
    await expect(
      af2paeJiffySchema.validateAt('pdb_file', {
        pdb_file: file,
        pae_file: validPae
      })
    ).rejects.toBeTruthy()
  })

})

describe('af2paeJiffySchema - pae_file', () => {
  it('accepts valid .json file under size limit', async () => {
    await expect(
      af2paeJiffySchema.validateAt('pae_file', {
        pdb_file: validPdb,
        pae_file: validPae
      })
    ).resolves.toBe(validPae)
  })

  it('rejects file exceeding 140MB', async () => {
    const file = makeFile('pae.json', 140_000_001, 'application/json', '{}')
    await expect(
      af2paeJiffySchema.validateAt('pae_file', {
        pdb_file: validPdb,
        pae_file: file
      })
    ).rejects.toBeTruthy()
  })

  it('rejects non-.json extension', async () => {
    const file = makeFile('pae.txt', 100)
    await expect(
      af2paeJiffySchema.validateAt('pae_file', {
        pdb_file: validPdb,
        pae_file: file
      })
    ).rejects.toBeTruthy()
  })

  it('rejects filename longer than 30 characters', async () => {
    const file = makeFile('a'.repeat(27) + '.json', 100, 'application/json', '{}')
    await expect(
      af2paeJiffySchema.validateAt('pae_file', {
        pdb_file: validPdb,
        pae_file: file
      })
    ).rejects.toBeTruthy()
  })
})
