import { describe, it, expect } from 'vitest'
import {
  cellResidues,
  chainBoundaries,
  decodeMatrix,
  describeCell,
  domainColor,
  formatRange,
  hexToRgb,
  matrixPixels,
  type AlignmentReport
} from '../rigidDomains'

// Six residues (A1-A4, B1-B2) in a 3 x 3 matrix of 2-residue cells
const bytes = Uint8Array.from([0, 13, 255, 13, 0, 128, 255, 128, 0])
const report = {
  residue_chains: ['A', 'A', 'A', 'A', 'B', 'B'],
  residue_numbers: [1, 2, 3, 4, 1, 2],
  residue_domains: [1, 1, 1, 1, 0, 0],
  matrix: {
    size: 3,
    bin: 2,
    max_sd: 20,
    data: btoa(String.fromCharCode(...bytes))
  }
} as unknown as AlignmentReport

const single = {
  ...report,
  matrix: { ...report.matrix, bin: 1 }
} as AlignmentReport

describe('decodeMatrix', () => {
  it('reads the base64 bytes', () => {
    expect(Array.from(decodeMatrix(report.matrix!.data))).toEqual(
      Array.from(bytes)
    )
  })
})

describe('matrixPixels', () => {
  it('runs from the rigid color to the surface', () => {
    const px = matrixPixels(
      Uint8Array.from([0, 255]),
      [10, 20, 30],
      [250, 240, 230]
    )
    expect(Array.from(px)).toEqual([10, 20, 30, 255, 250, 240, 230, 255])
  })
})

describe('hexToRgb', () => {
  it('reads 6- and 3-digit colors', () => {
    expect(hexToRgb('#0d366b')).toEqual([13, 54, 107])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
  })
})

describe('cellResidues', () => {
  it('names the residues a binned cell covers', () => {
    expect(cellResidues(report, 0)).toBe('A1–2')
    expect(cellResidues(report, 2)).toBe('B1–2')
  })

  it('names one residue when cells are not binned', () => {
    expect(cellResidues(single, 3)).toBe('A4')
  })

  it('names both chains when a cell spans a chain break', () => {
    const odd = {
      ...report,
      residue_chains: ['A', 'A', 'A', 'B', 'B', 'B']
    } as AlignmentReport
    expect(cellResidues(odd, 1)).toBe('A3–B4')
  })
})

describe('describeCell', () => {
  it('reports the spread of a pair in Å', () => {
    expect(describeCell(report, bytes, 0, 1)).toBe(
      'A1–2 and A3–4: distance varies by 1.0 Å'
    )
  })

  it('caps the scale', () => {
    expect(describeCell(report, bytes, 0, 2)).toBe(
      'A1–2 and B1–2: distance varies by ≥ 20 Å'
    )
  })
})

describe('chainBoundaries', () => {
  it('finds where each new chain starts, in cells', () => {
    expect(chainBoundaries(report)).toEqual([2])
    expect(chainBoundaries(single)).toEqual([4])
  })
})

describe('domainColor', () => {
  it('keeps a fixed color per domain and gray for flexible or extra domains', () => {
    expect(domainColor(1, false)).toBe('#2a78d6')
    expect(domainColor(1, true)).toBe('#3987e5')
    expect(domainColor(2, false)).toBe('#eb6834')
    expect(domainColor(0, false)).toBe('#a3a199')
    expect(domainColor(9, false)).toBe('#a3a199')
  })
})

describe('formatRange', () => {
  it('uses an en dash and collapses single residues', () => {
    expect(formatRange('A:2-13')).toBe('A:2–13')
    expect(formatRange('A:123-123')).toBe('A:123')
  })
})
