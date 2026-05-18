import { describe, it, expect } from 'vitest'
import { parsePLDDTFromPDB, parsePLDDTFromCIF } from '../pdbUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PDB ATOM line with correct fixed-column positions. */
const buildAtomLine = (
  chainId: string,
  residueNumber: number,
  plddt: number
) => {
  const width = 66
  const arr = Array<string>(width).fill(' ')
  arr[0] = 'A'
  arr[1] = 'T'
  arr[2] = 'O'
  arr[3] = 'M'
  arr[21] = (chainId || ' ').charAt(0)
  const resStr = String(residueNumber).padStart(4, ' ')
  for (let i = 0; i < resStr.length; i++) arr[22 + i] = resStr[i]!
  const pStr = plddt.toFixed(2).padStart(6, ' ')
  for (let i = 0; i < pStr.length; i++) arr[60 + i] = pStr[i]!
  return arr.join('')
}

/** Build a minimal mmCIF _atom_site block. */
const buildCif = (
  rows: { group?: string; chain: string; resSeq: number; bfactor: number }[]
) => {
  const header = [
    'loop_',
    '_atom_site.group_PDB',
    '_atom_site.auth_asym_id',
    '_atom_site.auth_seq_id',
    '_atom_site.B_iso_or_equiv'
  ].join('\n')
  const dataLines = rows
    .map(
      (r) =>
        `${r.group ?? 'ATOM'} ${r.chain} ${r.resSeq} ${r.bfactor.toFixed(2)}`
    )
    .join('\n')
  return `${header}\n${dataLines}\n`
}

// ---------------------------------------------------------------------------
// parsePLDDTFromPDB
// ---------------------------------------------------------------------------

describe('parsePLDDTFromPDB', () => {
  it('returns empty arrays for empty input', () => {
    const { data, chainBoundaries } = parsePLDDTFromPDB('')
    expect(data).toEqual([])
    expect(chainBoundaries).toEqual([])
  })

  it('ignores non-ATOM lines', () => {
    const content = [
      'REMARK  this should be ignored',
      'HETATM  also ignored',
      buildAtomLine('A', 1, 75.0)
    ].join('\n')
    const { data } = parsePLDDTFromPDB(content)
    expect(data).toHaveLength(1)
    expect(data[0]!.residueNumber).toBe(1)
  })

  it('handles a single residue with one atom', () => {
    const { data, chainBoundaries } = parsePLDDTFromPDB(
      buildAtomLine('A', 5, 42.0)
    )
    expect(data).toEqual([
      { globalIndex: 0, residueNumber: 5, plddt: 42.0, chainId: 'A' }
    ])
    expect(chainBoundaries).toEqual([])
  })

  it('averages pLDDT across multiple atoms of the same residue', () => {
    const content = [
      buildAtomLine('A', 1, 80.0),
      buildAtomLine('A', 1, 100.0) // average: (80 + 100) / 2 = 90
    ].join('\n')
    const { data } = parsePLDDTFromPDB(content)
    expect(data).toHaveLength(1)
    expect(data[0]!.plddt).toBe(90.0)
  })

  it('assigns sequential globalIndex values', () => {
    const content = [
      buildAtomLine('A', 1, 80.0),
      buildAtomLine('A', 2, 70.0),
      buildAtomLine('A', 3, 60.0)
    ].join('\n')
    const { data } = parsePLDDTFromPDB(content)
    expect(data.map((d) => d.globalIndex)).toEqual([0, 1, 2])
  })

  it('detects chain boundaries and records them at the correct globalIndex', () => {
    const content = [
      buildAtomLine('A', 1, 80.0),
      buildAtomLine('A', 2, 70.0),
      buildAtomLine('B', 1, 60.0) // boundary at globalIndex 2
    ].join('\n')
    const { data, chainBoundaries } = parsePLDDTFromPDB(content)
    expect(data).toHaveLength(3)
    expect(chainBoundaries).toEqual([2])
  })

  it('returns empty chainBoundaries for single-chain input', () => {
    const content = [
      buildAtomLine('A', 10, 50.0),
      buildAtomLine('A', 11, 55.0)
    ].join('\n')
    const { chainBoundaries } = parsePLDDTFromPDB(content)
    expect(chainBoundaries).toEqual([])
  })

  it('handles three chains with two boundaries (sequential residue numbers)', () => {
    // parsePLDDTFromPDB compares only residueNumber, so chains must have
    // non-overlapping residue numbers for boundary detection to work.
    const content = [
      buildAtomLine('A', 1, 90.0),
      buildAtomLine('B', 2, 80.0),
      buildAtomLine('C', 3, 70.0)
    ].join('\n')
    const { chainBoundaries } = parsePLDDTFromPDB(content)
    expect(chainBoundaries).toEqual([1, 2])
  })
})

// ---------------------------------------------------------------------------
// parsePLDDTFromCIF
// ---------------------------------------------------------------------------

describe('parsePLDDTFromCIF', () => {
  it('returns empty arrays for empty/unparseable input', () => {
    expect(parsePLDDTFromCIF('')).toEqual({ data: [], chainBoundaries: [] })
    expect(parsePLDDTFromCIF('not a cif file')).toEqual({
      data: [],
      chainBoundaries: []
    })
  })

  it('returns empty arrays when required columns are missing', () => {
    // CIF with group_PDB but no B_iso_or_equiv
    const cif = [
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      'ATOM A 1'
    ].join('\n')
    expect(parsePLDDTFromCIF(cif)).toEqual({ data: [], chainBoundaries: [] })
  })

  it('parses a single residue correctly', () => {
    const cif = buildCif([{ chain: 'A', resSeq: 1, bfactor: 75.0 }])
    const { data, chainBoundaries } = parsePLDDTFromCIF(cif)
    expect(data).toEqual([
      { globalIndex: 0, residueNumber: 1, plddt: 75.0, chainId: 'A' }
    ])
    expect(chainBoundaries).toEqual([])
  })

  it('averages B-factors across multiple atoms of the same residue', () => {
    const cif = buildCif([
      { chain: 'A', resSeq: 1, bfactor: 80.0 },
      { chain: 'A', resSeq: 1, bfactor: 100.0 } // average: 90
    ])
    const { data } = parsePLDDTFromCIF(cif)
    expect(data).toHaveLength(1)
    expect(data[0]!.plddt).toBe(90.0)
  })

  it('assigns sequential globalIndex values', () => {
    const cif = buildCif([
      { chain: 'A', resSeq: 1, bfactor: 90.0 },
      { chain: 'A', resSeq: 2, bfactor: 80.0 },
      { chain: 'A', resSeq: 3, bfactor: 70.0 }
    ])
    const { data } = parsePLDDTFromCIF(cif)
    expect(data.map((d) => d.globalIndex)).toEqual([0, 1, 2])
  })

  it('detects chain boundaries between chains that share residue numbers', () => {
    const cif = buildCif([
      { chain: 'A', resSeq: 1, bfactor: 90.0 },
      { chain: 'A', resSeq: 2, bfactor: 80.0 },
      { chain: 'B', resSeq: 1, bfactor: 70.0 } // resSeq resets to 1 — still a new chain
    ])
    const { data, chainBoundaries } = parsePLDDTFromCIF(cif)
    expect(data).toHaveLength(3)
    expect(chainBoundaries).toEqual([2])
  })

  it('handles three chains with two boundaries', () => {
    const cif = buildCif([
      { chain: 'A', resSeq: 1, bfactor: 90.0 },
      { chain: 'B', resSeq: 1, bfactor: 80.0 },
      { chain: 'C', resSeq: 1, bfactor: 70.0 }
    ])
    const { chainBoundaries } = parsePLDDTFromCIF(cif)
    expect(chainBoundaries).toEqual([1, 2])
  })

  it('filters out HETATM rows', () => {
    const cif = buildCif([
      { group: 'ATOM', chain: 'A', resSeq: 1, bfactor: 90.0 },
      { group: 'HETATM', chain: 'A', resSeq: 2, bfactor: 50.0 },
      { group: 'ATOM', chain: 'A', resSeq: 3, bfactor: 70.0 }
    ])
    const { data } = parsePLDDTFromCIF(cif)
    expect(data).toHaveLength(2)
    expect(data.map((d) => d.residueNumber)).toEqual([1, 3])
  })

  it('skips rows with non-numeric residue or B-factor values', () => {
    // Manually build a CIF with a bad row mixed in
    const cif = [
      'loop_',
      '_atom_site.group_PDB',
      '_atom_site.auth_asym_id',
      '_atom_site.auth_seq_id',
      '_atom_site.B_iso_or_equiv',
      'ATOM A 1 90.00',
      'ATOM A . 80.00', // invalid resSeq
      'ATOM A 3 ?', // invalid bfactor
      'ATOM A 4 70.00'
    ].join('\n')
    const { data } = parsePLDDTFromCIF(cif)
    expect(data.map((d) => d.residueNumber)).toEqual([1, 4])
  })

  it('returns empty chainBoundaries for single-chain input', () => {
    const cif = buildCif([
      { chain: 'A', resSeq: 1, bfactor: 90.0 },
      { chain: 'A', resSeq: 2, bfactor: 80.0 }
    ])
    const { chainBoundaries } = parsePLDDTFromCIF(cif)
    expect(chainBoundaries).toEqual([])
  })
})
