import { describe, it, expect } from 'vitest'
import { parsePLDDTFromPDB } from '../pdbUtils'

// Helper to build minimal PDB ATOM lines with correct column positions
const buildAtomLine = (
  chainId: string,
  residueNumber: number,
  plddt: number
) => {
  const width = 66 // we need at least up to index 65
  const arr = Array<string>(width).fill(' ')
  // "ATOM" at start
  arr[0] = 'A'
  arr[1] = 'T'
  arr[2] = 'O'
  arr[3] = 'M'
  // chain at index 21 (Column 22)
  arr[21] = (chainId || ' ').charAt(0)
  // residue number at substring(22,26) → indices 22..25
  const resStr = String(residueNumber).padStart(4, ' ')
  for (let i = 0; i < resStr.length; i++) arr[22 + i] = resStr[i]
  // pLDDT value at substring(60,66) → indices 60..65, width 6
  const pStr = plddt.toFixed(2).padStart(6, ' ')
  for (let i = 0; i < pStr.length; i++) arr[60 + i] = pStr[i]
  return arr.join('')
}

describe('parsePLDDTFromPDB', () => {
  it('aggregates pLDDT per residue and computes chain boundaries', () => {
    const lines: string[] = []
    // Chain A, residue 1 with two atoms → averaged
    lines.push(buildAtomLine('A', 1, 80.0))
    lines.push(buildAtomLine('A', 1, 100.0)) // average becomes (80+100)/2 = 90.0
    // Chain A, residue 2 with one atom
    lines.push(buildAtomLine('A', 2, 70.0))
    // Chain B, residue 1 starts → boundary should be globalIndex 2
    lines.push(buildAtomLine('B', 1, 60.0))

    const { data, chainBoundaries } = parsePLDDTFromPDB(lines.join('\n'))

    expect(data.length).toBe(3)

    expect(data[0]).toEqual({
      globalIndex: 0,
      residueNumber: 1,
      plddt: 90.0,
      chainId: 'A'
    })

    expect(data[1]).toEqual({
      globalIndex: 1,
      residueNumber: 2,
      plddt: 70.0,
      chainId: 'A'
    })

    expect(data[2]).toEqual({
      globalIndex: 2,
      residueNumber: 1,
      plddt: 60.0,
      chainId: 'B'
    })

    expect(chainBoundaries).toEqual([2])
  })

  it('returns empty boundaries for single-chain inputs', () => {
    const lines: string[] = []
    lines.push(buildAtomLine('A', 10, 50.0))
    lines.push(buildAtomLine('A', 11, 55.0))

    const { data, chainBoundaries } = parsePLDDTFromPDB(lines.join('\n'))

    expect(data.length).toBe(2)
    expect(chainBoundaries).toEqual([])
  })

  it('handles final residue push correctly', () => {
    const content = [
      buildAtomLine('C', 5, 42.0),
      buildAtomLine('C', 5, 44.0) // average to 43.0
    ].join('\n')

    const { data, chainBoundaries } = parsePLDDTFromPDB(content)

    expect(data).toEqual([
      { globalIndex: 0, residueNumber: 5, plddt: 43.0, chainId: 'C' }
    ])
    expect(chainBoundaries).toEqual([])
  })
})
