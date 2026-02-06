import { describe, it, expect } from 'vitest'
import { pdbFileSchema } from '../PDBFileSchema'

const makeFile = (name: string, type = 'text/plain', _size = 10) => {
  const pdbContent = `ATOM      1  N   MET A   1      11.104  13.207   6.204  1.00 20.00           N\nATOM      2  CA  MET A   1      12.560  13.207   6.204  1.00 20.00           C\nEND\n`
  const blob = new Blob([pdbContent], { type })
  return new File([blob], name, { type })
}

describe('PDBFileSchema', () => {
  it('accepts .pdb files with ATOM records and rejects wrong extension', async () => {
    await expect(pdbFileSchema.isValid(makeFile('model.pdb'))).resolves.toBe(
      true
    )
    await expect(pdbFileSchema.isValid(makeFile('model.txt'))).resolves.toBe(
      false
    )
  })
})
