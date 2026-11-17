import type { ChainMolType } from '../jobs/mdConstraints.js'
import {
  CARBOHYDRATE_RESIDUES,
  DNA_RESIDUES,
  PROTEIN_RESIDUES,
  RNA_RESIDUES
} from '../pdbResidues.js'
import type { StructureSegment } from './types.js'

const classifyResidue = (name: string): ChainMolType | null => {
  if (PROTEIN_RESIDUES.has(name)) return 'PRO'
  if (DNA_RESIDUES.has(name)) return 'DNA'
  if (RNA_RESIDUES.has(name)) return 'RNA'
  if (CARBOHYDRATE_RESIDUES.has(name)) return 'CAR'
  return null
}

/**
 * The CHARMM segid pdb2crd.py gives a PDB chain: its molecule type then its
 * chain ID, e.g. PROA, DNAB. Carbohydrates are CAR + chain (uppercase chain)
 * or CAL + chain uppercased (lowercase chain).
 *
 * CHARMM uppercases unquoted command input (c51b1 docs, usage: "All lower
 * case characters are converted to upper case"), so `segid PROa` in a
 * selection is read as PROA whatever case the segment was generated with.
 * The segid is therefore always uppercase here, and a structure whose chains
 * collide that way (e.g. protein chains A and a) is rejected by the
 * validator rather than silently merged.
 */
export const pdb2crdSegid = (
  chainId: string,
  molType: ChainMolType
): string => {
  if (molType === 'CAR') {
    const lowercase = chainId !== chainId.toUpperCase()
    return `${lowercase ? 'CAL' : 'CAR'}${chainId.toUpperCase()}`
  }
  return `${molType}${chainId}`.toUpperCase()
}

const sortedUnique = (values: Iterable<number>): number[] =>
  [...new Set(values)].sort((a, b) => a - b)

/**
 * The segments CHARMM will build from a PDB file: one per chain, named the
 * way pdb2crd.py names them. A chain's molecule type is that of its first
 * recognized residue, as `buildChainMolTypes` does; chains with none (waters,
 * ions) get no segment.
 */
export const readPdbSegments = (pdbText: string): StructureSegment[] => {
  const chains = new Map<
    string,
    { molType: ChainMolType | null; residues: number[] }
  >()
  for (const line of pdbText.split(/\r\n|\r|\n/)) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue
    const chainId = line[21]
    if (!chainId || chainId === ' ') continue
    const resSeq = Number(line.slice(22, 26).trim())
    const chain = chains.get(chainId) ?? { molType: null, residues: [] }
    chain.molType ??= classifyResidue(line.slice(17, 20).trim())
    if (Number.isInteger(resSeq)) chain.residues.push(resSeq)
    chains.set(chainId, chain)
  }
  return [...chains.entries()].flatMap(([chainId, chain]) =>
    chain.molType
      ? [
          {
            segid: pdb2crdSegid(chainId, chain.molType),
            chain_id: chainId,
            mol_type: chain.molType,
            residues: sortedUnique(chain.residues)
          }
        ]
      : []
  )
}

/**
 * The segments in a CHARMM PSF file, read from its !NATOM section. Each atom
 * line starts: atom number, segid, resid, ... Residue IDs with an insertion
 * code (e.g. 52A) are left out of the residue list, since constraints take
 * whole numbers. Segids are uppercased, as CHARMM reads them.
 */
export const readPsfSegments = (psfText: string): StructureSegment[] => {
  const lines = psfText.split(/\r\n|\r|\n/)
  const header = lines.findIndex((line) => /!NATOM\b/.test(line))
  if (header === -1) return []
  const count = Number.parseInt(lines[header]?.trim() ?? '', 10)
  if (!Number.isInteger(count) || count <= 0) return []

  const segments = new Map<string, number[]>()
  for (const line of lines.slice(header + 1, header + 1 + count)) {
    const [, segid, resid] = line.trim().split(/\s+/)
    if (!segid || !resid) continue
    const key = segid.toUpperCase()
    const residues = segments.get(key) ?? []
    if (/^-?\d+$/.test(resid)) residues.push(Number(resid))
    segments.set(key, residues)
  }
  return [...segments.entries()].map(([segid, residues]) => ({
    segid,
    chain_id: segid,
    residues: sortedUnique(residues)
  }))
}
