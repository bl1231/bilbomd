import { describe, it, expect, vi } from 'vitest'
import { chainIdCheck, pdbLineStartCheck, singleModelCheck } from '../fieldTests'

const makeFile = (name: string, content: string, type = 'text/plain') => {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  return file
}

describe('PDB validators', () => {
  it('chainIdCheck passes when chain IDs are present', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      containsChainId: async () => true
    }))
    const schema = chainIdCheck()
    const validPdb = makeFile('model.pdb', 'ATOM      1  N   MET A   1\nEND\n')
    await expect(schema.isValid(validPdb)).resolves.toBe(true)
  })

  it('chainIdCheck fails when missing chain IDs', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      containsChainId: async () => false
    }))
    const schema = chainIdCheck()
    const invalidPdb = makeFile(
      'model.pdb',
      'ATOM      1  N   MET     1\nEND\n'
    )
    await expect(schema.isValid(invalidPdb)).resolves.toBe(false)
  })

  it('pdbLineStartCheck passes when no leading spaces', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      noLeadingSpaceOnPDBLines: async () => true
    }))
    const schema = pdbLineStartCheck()
    const validPdb = makeFile('model.pdb', 'ATOM      1  N   MET A   1\nEND\n')
    await expect(schema.isValid(validPdb)).resolves.toBe(true)
  })

  it('pdbLineStartCheck fails when leading spaces present', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      noLeadingSpaceOnPDBLines: async () => false
    }))
    const schema = pdbLineStartCheck()
    const invalidPdb = makeFile(
      'model.pdb',
      ' ATOM      1  N   MET A   1\nEND\n'
    )
    await expect(schema.isValid(invalidPdb)).resolves.toBe(false)
  })

  it('singleModelCheck passes when no MODEL records present', async () => {
    const schema = singleModelCheck()
    const singleModel = makeFile(
      'model.pdb',
      'ATOM      1  N   MET A   1       1.000   2.000   3.000\nEND\n'
    )
    await expect(schema.isValid(singleModel)).resolves.toBe(true)
  })

  it('singleModelCheck passes when exactly one MODEL record present', async () => {
    const schema = singleModelCheck()
    const singleModel = makeFile(
      'model.pdb',
      'MODEL        1\nATOM      1  N   MET A   1       1.000   2.000   3.000\nENDMDL\nEND\n'
    )
    await expect(schema.isValid(singleModel)).resolves.toBe(true)
  })

  it('singleModelCheck fails when multiple MODEL records present', async () => {
    const schema = singleModelCheck()
    const multiModel = makeFile(
      'model.pdb',
      'MODEL        1\nATOM      1  N   MET A   1       1.000   2.000   3.000\nENDMDL\nMODEL        2\nATOM      1  N   MET A   1       4.000   5.000   6.000\nENDMDL\nEND\n'
    )
    await expect(schema.isValid(multiModel)).resolves.toBe(false)
  })
})
