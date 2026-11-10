import type { SequenceEntityDTO } from '@bilbomd/bilbomd-types'

export const BLOCK_SIZE = 10
const FASTA_LINE_WIDTH = 60

export type SequenceBlock = {
  // 1-based position of the block's last residue
  end: number
  text: string
}

// Split a sequence into blocks of ten, each labelled with its end position
export const sequenceBlocks = (
  sequence: string,
  size: number = BLOCK_SIZE
): SequenceBlock[] => {
  const blocks: SequenceBlock[] = []
  for (let start = 0; start < sequence.length; start += size) {
    const text = sequence.slice(start, start + size)
    blocks.push({ end: start + text.length, text })
  }
  return blocks
}

const isNucleicAcid = (type: string): boolean =>
  type === 'DNA' || type === 'RNA'

// "639 residues", "1 nucleotide"
export const lengthLabel = (entity: SequenceEntityDTO): string => {
  const n = entity.sequence.length
  const unit = isNucleicAcid(entity.type) ? 'nucleotide' : 'residue'
  return `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`
}

// Residues plus nucleotides, counting copies: the size the fold and BioEmu2
// limits apply to
export const totalSize = (entities: SequenceEntityDTO[]): number =>
  entities.reduce(
    (sum, e) => sum + e.sequence.length * (Number(e.copies) || 0),
    0
  )

const wrap = (sequence: string): string =>
  (sequence.match(new RegExp(`.{1,${FASTA_LINE_WIDTH}}`, 'g')) ?? []).join('\n')

// One FASTA record per entity; the copy number goes in the header
export const toFasta = (entities: SequenceEntityDTO[]): string =>
  entities
    .map((e) => `>${e.name} ${e.type} copies=${e.copies}\n${wrap(e.sequence)}`)
    .join('\n')
    .concat('\n')
