import { describe, it, expect } from 'vitest'
import {
  countPdbResidues,
  countCifResidues,
  getPaeMatrixSize,
  paeResidueMismatchMessage
} from '../paeStructureChecks.js'

// Fixed-column PDB record for residue `resSeq` on `chain`
const pdbAtom = (
  record: 'ATOM  ' | 'HETATM',
  name: string,
  resName: string,
  chain: string,
  resSeq: number,
  iCode = ' '
) =>
  `${record}    1  ${name.padEnd(3)} ${resName} ${chain}${String(resSeq).padStart(4)}${iCode}   10.000  10.000  10.000  1.00 90.00           C`

const squarePae = (n: number, key = 'predicted_aligned_error') =>
  JSON.stringify({
    [key]: Array.from({ length: n }, () => Array<number>(n).fill(1))
  })

describe('countPdbResidues', () => {
  it('counts each residue once, not each atom', () => {
    const text = [
      pdbAtom('ATOM  ', 'N', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'N', 'GLY', 'A', 2)
    ].join('\n')
    expect(countPdbResidues(text)).toBe(2)
  })

  it('counts HETATM residues such as glycans', () => {
    const text = [
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('HETATM', 'C1', 'NAG', 'A', 401)
    ].join('\n')
    expect(countPdbResidues(text)).toBe(2)
  })

  it('separates chains and insertion codes', () => {
    const text = [
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'B', 1),
      pdbAtom('ATOM  ', 'CA', 'ALA', 'B', 1, 'A')
    ].join('\n')
    expect(countPdbResidues(text)).toBe(3)
  })

  it('ignores non-atom records', () => {
    const text = [
      'HEADER    TEST',
      pdbAtom('ATOM  ', 'CA', 'ALA', 'A', 1),
      'TER',
      'END'
    ].join('\n')
    expect(countPdbResidues(text)).toBe(1)
  })
})

describe('countCifResidues', () => {
  const cif = (rows: string[], insCode = true) =>
    [
      'data_x',
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.id',
      '_atom_site.label_atom_id',
      '_atom_site.auth_seq_id',
      '_atom_site.auth_asym_id',
      ...(insCode ? ['_atom_site.pdbx_PDB_ins_code'] : []),
      ...rows
    ].join('\n')

  it('counts distinct chain/residue/insertion-code keys', () => {
    expect(
      countCifResidues(
        cif([
          'ATOM 1 N 1 A ?',
          'ATOM 2 CA 1 A ?',
          'ATOM 3 CA 2 A ?',
          'ATOM 4 CA 2 A B',
          'ATOM 5 CA 1 B ?'
        ])
      )
    ).toBe(4)
  })

  it('counts every record when several share a line', () => {
    expect(countCifResidues(cif(['ATOM 1 CA 1 A ? ATOM 2 CA 2 A ?']))).toBe(2)
  })

  it('works without an insertion code column', () => {
    expect(
      countCifResidues(cif(['ATOM 1 CA 1 A', 'ATOM 2 CA 2 A'], false))
    ).toBe(2)
  })

  it('returns 0 without an _atom_site block', () => {
    expect(countCifResidues('data_x\n_cell.length_a 10\n')).toBe(0)
  })
})

describe('getPaeMatrixSize', () => {
  it.each(['predicted_aligned_error', 'pae', 'pde'])(
    'reads the %s key',
    (key) => {
      expect(getPaeMatrixSize(squarePae(3, key))).toEqual({ size: 3 })
    }
  )

  it('unwraps an AlphaFold DB style one-element list', () => {
    expect(getPaeMatrixSize(`[${squarePae(4)}]`)).toEqual({ size: 4 })
  })

  it.each(['[]', `[${squarePae(2)}, ${squarePae(2)}]`])(
    'rejects a top-level list that is not one object: %s',
    (text) => {
      expect(getPaeMatrixSize(text)).toEqual({
        error: expect.stringContaining('exactly one object')
      })
    }
  )

  it('rejects a file without a PAE matrix', () => {
    expect(getPaeMatrixSize('{"plddt": [1, 2]}')).toEqual({
      error: expect.stringContaining('predicted_aligned_error')
    })
  })

  it('rejects a matrix that is not square', () => {
    expect(getPaeMatrixSize('{"pae": [[1, 2], [3]]}')).toEqual({
      error: expect.stringContaining('not square')
    })
  })

  it('returns null for invalid JSON', () => {
    expect(getPaeMatrixSize('{not json')).toBeNull()
  })
})

describe('paeResidueMismatchMessage', () => {
  it('is null when the sizes match', () => {
    expect(paeResidueMismatchMessage(250, 250)).toBeNull()
  })

  it('is null when the structure has no countable residues', () => {
    expect(paeResidueMismatchMessage(250, 0)).toBeNull()
  })

  it('reports both sizes when they differ', () => {
    const message = paeResidueMismatchMessage(250, 262)
    expect(message).toContain('250 × 250')
    expect(message).toContain('262 residues')
  })
})
