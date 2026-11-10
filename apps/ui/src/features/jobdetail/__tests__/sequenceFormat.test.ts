import { describe, it, expect } from 'vitest'
import {
  lengthLabel,
  sequenceBlocks,
  toFasta,
  totalSize
} from '../sequenceFormat'

const protein = {
  name: 'pro-1',
  sequence: 'A'.repeat(125),
  type: 'Protein',
  copies: 2
}
const dna = { name: 'dna-1', sequence: 'ACGT', type: 'DNA', copies: 1 }

describe('sequenceBlocks', () => {
  it('splits into blocks of ten labelled with their end position', () => {
    const blocks = sequenceBlocks('ABCDEFGHIJKLMNOPQRSTUVWXY')
    expect(blocks).toEqual([
      { end: 10, text: 'ABCDEFGHIJ' },
      { end: 20, text: 'KLMNOPQRST' },
      { end: 25, text: 'UVWXY' }
    ])
  })

  it('returns nothing for an empty sequence', () => {
    expect(sequenceBlocks('')).toEqual([])
  })
})

describe('lengthLabel', () => {
  it('counts residues for proteins and nucleotides for DNA and RNA', () => {
    expect(lengthLabel(protein)).toBe('125 residues')
    expect(lengthLabel(dna)).toBe('4 nucleotides')
    expect(lengthLabel({ ...dna, type: 'RNA', sequence: 'A' })).toBe(
      '1 nucleotide'
    )
  })

  it('groups thousands', () => {
    expect(lengthLabel({ ...protein, sequence: 'A'.repeat(1614) })).toBe(
      '1,614 residues'
    )
  })
})

describe('totalSize', () => {
  it('counts every copy', () => {
    expect(totalSize([protein, dna])).toBe(254)
  })
})

describe('toFasta', () => {
  it('writes one record per entity, wrapped at 60, with the copy number', () => {
    expect(toFasta([protein, dna])).toBe(
      [
        '>pro-1 Protein copies=2',
        'A'.repeat(60),
        'A'.repeat(60),
        'A'.repeat(5),
        '>dna-1 DNA copies=1',
        'ACGT',
        ''
      ].join('\n')
    )
  })
})
