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

/**
 * Molecule type of a residue name, as pdb_utils.py classify_residue gives it
 * (null for its UNKNOWN). A segment's type is that of its first recognized
 * residue.
 */
export const classifyResidue = (name: string): ChainMolType | null => {
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

// Backbone links between residue i and i+1, as pdb2crd.py checks them. A
// link clearly longer than the bond is a chain break (a missing loop, or
// separate molecules), which CHARMM does not bond across.
// Nucleic acids: O3'(i)-P(i+1) is a 1.6 A bond; when P is missing,
// O3'(i)-O5'(i+1) is about 2.5 A through it.
// Proteins: C(i)-N(i+1) is a 1.33 A peptide bond; when C or N is missing,
// CA(i)-CA(i+1) is 3.8 A (2.9 A for a cis peptide).
const LINK_CHECKS: Partial<
  Record<ChainMolType, { from: string[]; to: string[]; max: number }[]>
> = {
  DNA: [
    { from: ["O3'", 'O3*'], to: ['P'], max: 2.5 },
    { from: ["O3'", 'O3*'], to: ["O5'", 'O5*'], max: 3.5 }
  ],
  RNA: [
    { from: ["O3'", 'O3*'], to: ['P'], max: 2.5 },
    { from: ["O3'", 'O3*'], to: ["O5'", 'O5*'], max: 3.5 }
  ],
  PRO: [
    { from: ['C'], to: ['N'], max: 2.0 },
    { from: ['CA'], to: ['CA'], max: 4.5 }
  ]
}

// Letters pdb2crd.py tries, in order, for a molecule split off a chain
const SEGMENT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type Xyz = [number, number, number]

interface Atom {
  kind: 'atom'
  chainId: string
  resName: string
  resSeq: string
  /** PDB column 27 / mmCIF pdbx_PDB_ins_code; pdb2crd drops these atoms */
  insertionCode: string
  atomName: string
  /** PDB columns 73-76; blank for mmCIF (Biopython writes none) */
  segid: string
  xyz: Xyz | null
}

/** A TER record: pdb2crd starts a new molecule after one */
interface Ter {
  kind: 'ter'
}

type PdbRecord = Atom | Ter

const coordsOf = (residue: Atom[], names: string[]): Xyz | null =>
  residue.find((a) => names.includes(a.atomName))?.xyz ?? null

const distance = (a: Xyz, b: Xyz) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// The gap between two consecutive residues of one polymer type that are
// clearly not bonded, in A, else null (pdb2crd.py _chain_break). A link that
// can't be judged (atoms missing) is left alone.
const chainBreak = (prev: Atom[], next: Atom[]): number | null => {
  const type = classifyResidue(prev[0]!.resName)
  if (!type || type !== classifyResidue(next[0]!.resName)) return null
  for (const { from, to, max } of LINK_CHECKS[type] ?? []) {
    const a = coordsOf(prev, from)
    const b = coordsOf(next, to)
    if (a && b) {
      const d = distance(a, b)
      return d > max ? d : null
    }
  }
  return null
}

// Consecutive atoms of one residue
const residuesOf = (atoms: Atom[]): Atom[][] => {
  const out: Atom[][] = []
  let key: string | null = null
  for (const a of atoms) {
    const next = `${a.resName}|${a.resSeq}|${a.insertionCode}`
    if (next !== key) out.push([])
    key = next
    out[out.length - 1]!.push(a)
  }
  return out
}

interface Piece {
  atoms: Atom[]
  /** The break before this piece: the residue it follows, and the gap */
  chainBreak?: { after: number; distance: number }
}

// A molecule's atoms split wherever consecutive residues are not bonded
const splitAtChainBreaks = (atoms: Atom[]): Piece[] => {
  const pieces: Piece[] = [{ atoms: [] }]
  let previous: Atom[] | null = null
  for (const residue of residuesOf(atoms)) {
    const gap = previous ? chainBreak(previous, residue) : null
    if (previous && gap !== null) {
      pieces.push({
        atoms: [],
        chainBreak: {
          after: Number(previous[0]!.resSeq),
          distance: Math.round(gap * 10) / 10
        }
      })
    }
    pieces[pieces.length - 1]!.atoms.push(...residue)
    previous = residue
  }
  return pieces.filter((p) => p.atoms.length > 0)
}

interface RawSegment {
  chainId: string
  segid: string
  atoms: Atom[]
  chainBreak?: Piece['chainBreak']
}

// The molecules pdb2crd.py builds (read_raw_segments): a chain's atoms start
// a new one after a TER record, when the segid changes, or at a chain break
const rawSegments = (records: PdbRecord[]): RawSegment[] => {
  const segments: RawSegment[] = []
  const open = new Map<string, RawSegment>()
  let lastChain: string | null = null
  for (const record of records) {
    if (record.kind === 'ter') {
      if (lastChain !== null) open.delete(lastChain)
      continue
    }
    lastChain = record.chainId
    const current = open.get(record.chainId)
    if (current && current.segid === record.segid) {
      current.atoms.push(record)
      continue
    }
    const segment = {
      chainId: record.chainId,
      segid: record.segid,
      atoms: [record]
    }
    segments.push(segment)
    open.set(record.chainId, segment)
  }
  return segments.flatMap((s) =>
    splitAtChainBreaks(s.atoms).map((piece) => ({ ...s, ...piece }))
  )
}

const isWhole = (value: string) =>
  value.trim() === '' || value === '?' || value === '.'

// pdb2crd's preparation drops waters, ions and atoms with an insertion code
const keptByPdb2crd = (a: Atom) =>
  a.resName !== WATER &&
  !PDB2CRD_IONS.has(a.resName) &&
  isWhole(a.insertionCode)

// The segments CHARMM builds, named as pdb2crd.py names them (assign_segids).
// A chain's first molecule is type + chain ID. A later one gets its type with
// the chain's own letter, else its input segid's last letter, else the first
// letter no chain uses; letters other chains use are skipped. A molecule's
// type is that of its first recognized residue; those with none get no
// segment.
const segmentsFromRecords = (records: PdbRecord[]): StructureSegment[] => {
  const kept = rawSegments(records).filter(
    (s) =>
      !isWhole(s.chainId) && s.chainId !== '.' && s.atoms.some(keptByPdb2crd)
  )
  const chainLetters = new Set(kept.map((s) => s.chainId.toUpperCase()))
  const taken = new Set<string>()
  const namedChains = new Set<string>()
  const out: StructureSegment[] = []
  for (const s of kept) {
    const molType = s.atoms
      .map((a) => classifyResidue(a.resName))
      .find((t) => t !== null)
    const first = !namedChains.has(s.chainId)
    namedChains.add(s.chainId)
    if (!molType) continue

    let segid: string | undefined
    if (first) {
      segid = pdb2crdSegid(s.chainId, molType)
    } else {
      const segidLetter = s.segid.slice(-1)
      const candidates = [
        s.chainId,
        ...(/^[A-Za-z0-9]$/.test(segidLetter) &&
        !chainLetters.has(segidLetter.toUpperCase())
          ? [segidLetter]
          : []),
        ...[...SEGMENT_LETTERS].filter((c) => !chainLetters.has(c))
      ]
      segid = candidates
        .map((c) => pdb2crdSegid(c, molType))
        .find((name) => !taken.has(name))
      // pdb2crd stops with an error when no letter is free
      if (!segid) continue
    }
    taken.add(segid)
    const residues = s.atoms
      .filter((a) => keptByPdb2crd(a) && /^-?\d+$/.test(a.resSeq))
      .map((a) => Number(a.resSeq))
    out.push({
      segid,
      chain_id: s.chainId,
      mol_type: molType,
      residues: sortedUnique(residues),
      ...(s.chainBreak ? { chain_break: s.chainBreak } : {})
    })
  }
  return out
}

const coordinate = (text: string | undefined): number | null => {
  const n = Number.parseFloat(text ?? '')
  return Number.isFinite(n) ? n : null
}

const xyzOf = (x?: string, y?: string, z?: string): Xyz | null => {
  const c = [coordinate(x), coordinate(y), coordinate(z)]
  return c.every((v) => v !== null) ? (c as Xyz) : null
}

/** The segments CHARMM will build from a PDB file, named as pdb2crd.py does */
export const readPdbSegments = (pdbText: string): StructureSegment[] => {
  const lines = pdbText.split(/\r\n|\r|\n/)
  // pdb2crd reads only the first model
  const end = lines.findIndex((line) => line.startsWith('ENDMDL'))
  return segmentsFromRecords(
    lines
      .slice(0, end === -1 ? undefined : end)
      .flatMap((line): PdbRecord[] => {
        if (line.startsWith('TER')) return [{ kind: 'ter' }]
        if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) return []
        return [
          {
            kind: 'atom',
            chainId: line[21] ?? '',
            resName: line.slice(17, 20).trim(),
            resSeq: line.slice(22, 26).trim(),
            insertionCode: line[26] ?? '',
            atomName: line.slice(12, 16).trim(),
            segid: line.slice(72, 76).trim(),
            xyz: xyzOf(
              line.slice(30, 38),
              line.slice(38, 46),
              line.slice(46, 54)
            )
          }
        ]
      })
  )
}

/**
 * The segments CHARMM will build from an mmCIF file. The worker converts the
 * file to PDB with Biopython's MMCIFParser, which takes the chain from
 * auth_asym_id and the residue number from auth_seq_id, so these do too.
 * PDBIO groups each chain's atoms together, writes TER only at the end of a
 * chain and leaves segids blank, so only unbonded nucleotides split a chain.
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
  const atomIdx = column('label_atom_id', 'auth_atom_id')
  const [xIdx, yIdx, zIdx] = ['Cartn_x', 'Cartn_y', 'Cartn_z'].map((n) =>
    column(n)
  )
  const modelIdx = column('pdbx_PDB_model_num')
  if (chainIdx === -1 || nameIdx === -1 || seqIdx === -1) return []
  // pdb2crd reads only the first model of the converted file
  const firstModel =
    modelIdx === -1 ? undefined : parsed.dataRows[0]?.[modelIdx]
  const byChain = new Map<string, Atom[]>()
  for (const row of parsed.dataRows) {
    if (firstModel !== undefined && row[modelIdx] !== firstModel) continue
    const chainId = row[chainIdx] ?? ''
    const atoms = byChain.get(chainId) ?? []
    atoms.push({
      kind: 'atom',
      chainId,
      resName: row[nameIdx] ?? '',
      resSeq: row[seqIdx] ?? '',
      insertionCode: insIdx === -1 ? '' : (row[insIdx] ?? ''),
      atomName: atomIdx === -1 ? '' : (row[atomIdx] ?? ''),
      segid: '',
      xyz:
        xIdx === undefined || xIdx === -1
          ? null
          : xyzOf(row[xIdx], row[yIdx ?? -1], row[zIdx ?? -1])
    })
    byChain.set(chainId, atoms)
  }
  return segmentsFromRecords(
    [...byChain.values()].flatMap((atoms): PdbRecord[] => [
      ...atoms,
      { kind: 'ter' }
    ])
  )
}

/**
 * The segments in a CHARMM PSF file, read from its !NATOM section. Each atom
 * line starts: atom number, segid, resid, ... Residue IDs with an insertion
 * code (e.g. 52A) are left out of the residue list, since constraints take
 * whole numbers. Segids are uppercased, as CHARMM reads them.
 *
 * chain_id is the chain the worker writes into result PDBs for the segment:
 * the segid's last character (writeSegidToChainid), so the job page's viewer
 * finds the constrained residues. Several segments can share one (PROA and
 * DNAA are both chain A); constraints themselves always use the segid.
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
    chain_id: segid.slice(-1),
    residues: sortedUnique(residues)
  }))
}
