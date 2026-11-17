import type { ChainMolType } from '../jobs/mdConstraints.js'
import {
  CARBOHYDRATE_RESIDUES,
  DNA_RESIDUES,
  PROTEIN_RESIDUES,
  RNA_RESIDUES
} from '../pdbResidues.js'
import { parseCifAtomSite } from '../cifUtils.js'
import type { StructureSegment } from './types.js'

// DNA names pdb_utils.py classifies as DNA besides the standard ones
const DNA_ALIASES = new Set(['ADE', 'CYT', 'GUA', 'THY'])

// What pdb2crd.py removes before it builds a segment (remove_water,
// remove_ions): residues it never gives CHARMM
const WATER = 'HOH'
const PDB2CRD_IONS = new Set([
  'LI', 'NA', 'K', 'RB', 'CS',
  'MG', 'CA', 'SR', 'BA',
  'SC', 'TI', 'V', 'CR', 'MN', 'FE', 'CO', 'NI', 'CU', 'ZN', 'MO', 'CD', 'HG',
  'AL', 'GA', 'IN', 'SN', 'PB', 'B', 'SE', 'AS',
  'CL', 'BR', 'F',
  'SO4', 'PO4', 'NO3', 'CN'
]) // prettier-ignore

// Molecule type as pdb_utils.py classify_residue gives it
const classifyResidue = (name: string): ChainMolType | null => {
  if (PROTEIN_RESIDUES.has(name)) return 'PRO'
  if (DNA_RESIDUES.has(name) || DNA_ALIASES.has(name)) return 'DNA'
  if (RNA_RESIDUES.has(name)) return 'RNA'
  if (CARBOHYDRATE_RESIDUES.has(name)) return 'CAR'
  return null
}

/**
 * The CHARMM segid pdb2crd.py gives a PDB chain: its molecule type then its
 * chain ID, e.g. PROA, DNAB. Carbohydrates are CAR + chain for an uppercase
 * letter chain, otherwise CAL + chain uppercased (pdb2crd tests isupper(),
 * which is false for digits too).
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
    const prefix = /^[A-Z]$/.test(chainId) ? 'CAR' : 'CAL'
    return `${prefix}${chainId.toUpperCase()}`
  }
  return `${molType}${chainId}`.toUpperCase()
}

const sortedUnique = (values: Iterable<number>): number[] =>
  [...new Set(values)].sort((a, b) => a - b)

interface Atom {
  chainId: string
  resName: string
  resSeq: string
  /** PDB column 27 / mmCIF pdbx_PDB_ins_code; pdb2crd drops these atoms */
  insertionCode: string
}

// One segment per chain, as pdb2crd builds them. A chain's molecule type is
// that of its first recognized residue. Its residues are those left after
// pdb2crd's preparation, which drops waters, ions and atoms with an insertion
// code; chains with no recognized residue get no segment.
const segmentsFromAtoms = (atoms: Atom[]): StructureSegment[] => {
  const chains = new Map<
    string,
    { molType: ChainMolType | null; residues: number[] }
  >()
  for (const { chainId, resName, resSeq, insertionCode } of atoms) {
    if (chainId.trim() === '' || chainId === '.' || chainId === '?') continue
    const chain = chains.get(chainId) ?? { molType: null, residues: [] }
    chain.molType ??= classifyResidue(resName)
    const kept =
      resName !== WATER &&
      !PDB2CRD_IONS.has(resName) &&
      (insertionCode.trim() === '' ||
        insertionCode === '?' ||
        insertionCode === '.')
    if (kept && /^-?\d+$/.test(resSeq)) chain.residues.push(Number(resSeq))
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

/** The segments CHARMM will build from a PDB file, named as pdb2crd.py does */
export const readPdbSegments = (pdbText: string): StructureSegment[] =>
  segmentsFromAtoms(
    pdbText
      .split(/\r\n|\r|\n/)
      .filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'))
      .map((line) => ({
        chainId: line[21] ?? '',
        resName: line.slice(17, 20).trim(),
        resSeq: line.slice(22, 26).trim(),
        insertionCode: line[26] ?? ''
      }))
  )

/**
 * The segments CHARMM will build from an mmCIF file. The worker converts the
 * file to PDB with Biopython's MMCIFParser, which takes the chain from
 * auth_asym_id and the residue number from auth_seq_id, so these do too.
 */
export const readCifSegments = (cifText: string): StructureSegment[] => {
  const parsed = parseCifAtomSite(cifText)
  if (!parsed) return []
  const column = (...names: string[]) =>
    names.map((n) => parsed.columnNames.indexOf(n)).find((i) => i !== -1) ?? -1
  const chainIdx = column('auth_asym_id', 'label_asym_id')
  const nameIdx = column('label_comp_id', 'auth_comp_id')
  const seqIdx = column('auth_seq_id', 'label_seq_id')
  const insIdx = column('pdbx_PDB_ins_code')
  if (chainIdx === -1 || nameIdx === -1 || seqIdx === -1) return []
  return segmentsFromAtoms(
    parsed.dataRows.map((row) => ({
      chainId: row[chainIdx] ?? '',
      resName: row[nameIdx] ?? '',
      resSeq: row[seqIdx] ?? '',
      insertionCode: insIdx === -1 ? '' : (row[insIdx] ?? '')
    }))
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
