import fs from 'fs/promises'
import {
  SUPPORTED_PDB_RESIDUES,
  parseCifAtomSite,
  cifContainsChainId as cifContainsChainIdUtil,
  cifHasAllowedResiduesOnly as cifHasAllowedResiduesOnlyUtil,
  cifIsSingleModel as cifIsSingleModelUtil,
  PROTEIN_RESIDUES,
  DNA_RESIDUES,
  RNA_RESIDUES,
  CARBOHYDRATE_RESIDUES,
  GAFF_COFACTORS,
  METAL_COFACTORS,
  analyzeSaxsData
} from '@bilbomd/bilbomd-types'
import type { QUnits, SaxsDataAnalysis } from '@bilbomd/bilbomd-types'
import { logger } from '../../middleware/loggers.js'

const fromCharmmGui = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split(/[\r\n]+/)
    for (let i = 0; i < 5 && i < lines.length; i++) {
      if (/CHARMM-GUI/.test(lines[i])) return true
    }
    return false
  } catch {
    return false
  }
}

const isCRD = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split(/[\r\n]+/)
    let starLinesCount = 0
    let foundEndPattern = false

    // Check for lines starting with *
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('*')) {
        starLinesCount++
        if (starLinesCount > 6) {
          // More than 6 lines starting with *, not matching the pattern
          break
        }
      } else {
        // Check if the line immediately after the last *-line matches the specified pattern
        if (starLinesCount >= 2 && starLinesCount <= 6) {
          const endPattern = /^\s+\d+\s+EXT$/
          foundEndPattern = endPattern.test(lines[i])
        }
        break // No more lines starting with * consecutively, exit the loop
      }
    }

    return foundEndPattern
  } catch {
    return false
  }
}

const isPsfData = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split(/[\r\n]+/g)
    const atomRegex =
      /^\s*\d+\s+[A-Z]{4}\s+\d+\s+[A-Z]{3,}\s+[a-zA-Z0-9_']+\s+[a-zA-Z0-9_']+\s+-?\d+\.\d+(?:[eE][+-]?\d+)?\s+\d+\.\d+(?:[eE][+-]?\d+)?\s+\d+/

    if (!lines[0].includes('PSF')) {
      return false
    }

    if (!lines.some((line) => line.trim().endsWith('!NTITLE'))) {
      return false
    }

    const natomLineIndex = lines.findIndex((line) => /\d+\s+!NATOM/.test(line))
    if (natomLineIndex === -1) {
      return false
    }

    const natomResult = lines[natomLineIndex].match(/(\d+)\s+!NATOM/)
    if (!natomResult) {
      return false
    }

    const natom = parseInt(natomResult[1], 10)
    if (isNaN(natom)) {
      return false
    }

    // Check for atom lines directly following the !NATOM line
    const atomLines = lines.slice(
      natomLineIndex + 1,
      natomLineIndex + 1 + natom
    )
    if (atomLines.length !== natom) {
      return false
    }

    for (const line of atomLines) {
      if (!atomRegex.test(line)) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

const noSpaces = (file: File): Promise<boolean> => {
  const spaces = /\s/
  return new Promise((resolve) => {
    if (spaces.test(file.name)) {
      resolve(false)
    }
    resolve(true)
  })
}

// Runs the shared SAXS analysis (the same code the UI runs in the browser) on
// an uploaded file. See analyzeSaxsData in @bilbomd/bilbomd-types for the rules.
const isSaxsData = async (
  file: Express.Multer.File,
  qUnits: QUnits = 'auto'
): Promise<SaxsDataAnalysis> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    return analyzeSaxsData(text, { qUnits })
  } catch (err) {
    logger.error('Error reading SAXS file:', err)
    return {
      valid: false,
      message: 'Error reading SAXS file content',
      warnings: [],
      changed: false,
      points: [],
      stats: { totalPoints: 0, keptPoints: 0, trimmedLowQ: 0, trimmedHighQ: 0 }
    }
  }
}

const containsChainId = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split('\n')
    const isValid = lines.some((line) => {
      return (
        (line.startsWith('ATOM') || line.startsWith('HETATM')) &&
        /^[A-Za-z]$/.test(line[21])
      )
    })
    return isValid
  } catch {
    return false
  }
}

const isRNA = async (
  file: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split(/\r?\n/)
    const validNucleotides = new Set(['A', 'C', 'G', 'U'])

    for (const line of lines) {
      if (line.startsWith('HETATM')) {
        return {
          valid: false,
          message: 'File contains HETATM lines which are not allowed.'
        }
      }

      if (line.startsWith('ATOM')) {
        const parts = line.split(/\s+/)
        const residueName = parts[3]
        if (residueName.length !== 1 || !validNucleotides.has(residueName)) {
          return {
            valid: false,
            message: `Invalid residue name '${residueName}'. Expected A, C, G, U.`
          }
        }
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, message: 'Error reading the file.' }
  }
}

// Residues that stay in the model. Waters and ions are stripped before MD, so
// how they are numbered does not matter.
const MODELLED_RESIDUES = new Set<string>([
  ...PROTEIN_RESIDUES,
  ...DNA_RESIDUES,
  ...RNA_RESIDUES,
  ...CARBOHYDRATE_RESIDUES,
  ...GAFF_COFACTORS,
  ...METAL_COFACTORS
])

// A residue is identified by chain + number + insertion code, and constraints
// select residues by chain and number. Two residues sharing all three (e.g. a
// glycan numbered inside the protein's range) cannot be told apart: the GLYCAM
// renaming merges them and minimization fails on the leftover sugar.
const findSharedResidueNumbers = (lines: string[]): string[] => {
  const namesByResidue = new Map<string, Set<string>>()
  for (const line of lines) {
    // Later models repeat the first one
    if (line.startsWith('ENDMDL')) break
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue
    // Alternate conformers may legitimately differ in residue name
    const altLoc = line[16] ?? ' '
    if (altLoc !== ' ' && altLoc !== 'A') continue
    const residue = line.slice(17, 20).trim()
    if (!MODELLED_RESIDUES.has(residue)) continue
    const chain = line[21] ?? ' '
    const number = line.slice(22, 27).trim()
    // CHARMM-written files give every segment the same chain letter and tell
    // residues apart by segment ID (columns 73-76)
    const segid = line.slice(72, 76).trim()
    const key = `chain ${chain} residue ${number}${segid ? ` (segment ${segid})` : ''}`
    const names = namesByResidue.get(key) ?? new Set<string>()
    names.add(residue)
    namesByResidue.set(key, names)
  }
  return [...namesByResidue]
    .filter(([, names]) => names.size > 1)
    .map(([key, names]) => `${key} (${[...names].join(' and ')})`)
}

const checkPdbResidues = async (
  file: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split('\n')
    const unsupported = new Set<string>()

    for (const line of lines) {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const residue = line.slice(17, 20).trim()
        if (residue && !SUPPORTED_PDB_RESIDUES.has(residue)) {
          unsupported.add(residue)
        }
      }
    }

    if (unsupported.size > 0) {
      const list = [...unsupported].sort().join(', ')
      return {
        valid: false,
        message: `PDB contains unsupported residues: ${list}. These cannot be processed by BilboMD.`
      }
    }

    const shared = findSharedResidueNumbers(lines)
    if (shared.length > 0) {
      const shown = shared.slice(0, 3).join(', ')
      const more = shared.length > 3 ? ` and ${shared.length - 3} more` : ''
      return {
        valid: false,
        message: `PDB has residues that share a chain and residue number: ${shown}${more}. Give each residue its own number within its chain (for example, number sugars and ligands after the last protein residue).`
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, message: 'Error reading PDB file.' }
  }
}

const isValidConstInpFile = async (
  file: Express.Multer.File,
  mode: string
): Promise<string | true> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const lines = text.split('\n').filter((line) => line.trim() !== '') // Filter out empty lines

    // Check if the last non-empty line is exactly 'return'
    if (lines.length === 0 || lines[lines.length - 1].trim() !== 'return') {
      return 'The last line must be "return".'
    }

    // Check for at least one 'define' and one 'cons fix sele' line
    const hasDefine = lines.some((line) => line.startsWith('define'))
    if (!hasDefine) {
      return 'At least one line must start with "define".'
    }

    const hasConsFixSele = lines.some((line) =>
      line.startsWith('cons fix sele')
    )
    if (!hasConsFixSele) {
      return 'At least one line must start with "cons fix sele".'
    }

    // Check 'define' lines for 'segid' followed by the correct format
    if (mode === 'pdb') {
      const segidRegex = /segid\s+((PRO|DNA|RNA|CAR|CAL)[A-Z])\b/
      const validSegid = lines
        .filter((line) => line.startsWith('define'))
        .every((line) => segidRegex.test(line))
      if (!validSegid) {
        return 'segid must be: PRO[A-Z], DNA[A-Z], RNA[A-Z], etc.'
      }
    } else if (mode === 'crd_psf') {
      const segidRegex = /segid\s+([A-Z]{4})\b/
      const validSegid = lines
        .filter((line) => line.startsWith('define'))
        .every((line) => segidRegex.test(line))
      if (!validSegid) {
        return 'segid must contain 4 uppercase letters [A-Z]'
      }
    }

    // Allowlist check: reject any line that doesn't start with a permitted keyword.
    // This blocks CHARMM directives like 'system', 'open', 'read', etc. that could
    // execute arbitrary OS commands or perform file I/O when the file is STREAMed.
    const ALLOWED_PREFIXES = [
      'define',
      'cons fix',
      'cons harm',
      'shape desc',
      'return',
      '!',
      '*'
    ]
    for (const line of lines) {
      const lower = line.trim().toLowerCase()
      if (!ALLOWED_PREFIXES.some((pfx) => lower.startsWith(pfx))) {
        return `Disallowed keyword in constraint file: "${line.trim()}"`
      }
    }

    return true // All checks passed
  } catch {
    return 'Error reading file'
  }
}

const cifContainsChainId = async (
  file: Express.Multer.File
): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const parsed = parseCifAtomSite(text)
    return parsed !== null && cifContainsChainIdUtil(parsed)
  } catch {
    return false
  }
}

const checkCifResidues = async (
  file: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    const parsed = parseCifAtomSite(text)
    if (!parsed) {
      return { valid: false, message: 'No _atom_site block found in CIF file.' }
    }
    const result = cifHasAllowedResiduesOnlyUtil(parsed)
    if (result.valid) return { valid: true }
    const list = result.unsupportedResidues.join(', ')
    return {
      valid: false,
      message: `CIF contains unsupported residues: ${list}. These cannot be processed by BilboMD.`
    }
  } catch {
    return { valid: false, message: 'Error reading CIF file.' }
  }
}

// NMR entries ship every model of the ensemble in one file. The pipelines
// expect one structure (KGSrna, for one, fails on the repeated atoms), so a
// file with more than one MODEL record (or CIF model number) is rejected.
const isSingleModel = async (file: Express.Multer.File): Promise<boolean> => {
  try {
    const text = await fs.readFile(file.path, 'utf8')
    if (file.originalname?.toLowerCase().endsWith('.cif')) {
      const parsed = parseCifAtomSite(text)
      // No _atom_site block: the residue check reports that
      return parsed === null || cifIsSingleModelUtil(parsed)
    }
    let models = 0
    for (const line of text.split(/\r?\n/)) {
      if (/^MODEL(\s|$)/.test(line) && ++models > 1) return false
    }
    return true
  } catch {
    return false
  }
}

// --- PAE ↔ structure size -------------------------------------------------
// pae2const.py (tools/python) requires the PAE matrix to be N×N, where N is
// the number of distinct residues in the structure. These helpers count both
// the same way it does, so a mismatch is rejected at submission instead of
// failing the job on the worker.

// PDBHandler._prepare_pdb_mappings: distinct (chain, resSeq, iCode) over
// every ATOM/HETATM record
const countPdbResidues = (text: string): number => {
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue
    const resSeq = line.slice(22, 26).trim()
    if (!/^[+-]?\d+$/.test(resSeq)) continue
    const chain = (line[21] ?? '').trim() || ' '
    const iCode = (line[26] ?? '').trim()
    seen.add(`${chain}|${Number(resSeq)}|${iCode}`)
  }
  return seen.size
}

// CIFHandler uses Biopython's MMCIFParser, which keys residues on the author
// chain, sequence number and insertion code
const countCifResidues = (text: string): number => {
  const parsed = parseCifAtomSite(text)
  if (!parsed) return 0
  const col = (...names: string[]) =>
    names.map((n) => parsed.columnNames.indexOf(n)).find((i) => i !== -1) ?? -1
  const chainIdx = col('auth_asym_id', 'label_asym_id')
  const seqIdx = col('auth_seq_id', 'label_seq_id')
  const iCodeIdx = col('pdbx_PDB_ins_code')
  if (chainIdx === -1 || seqIdx === -1) return 0
  const blank = (v: string | undefined) => (v === '?' || v === '.' ? '' : v)
  const seen = new Set<string>()
  for (const row of parsed.dataRows) {
    const seq = blank(row[seqIdx])
    if (!seq) continue
    const iCode = iCodeIdx === -1 ? '' : (blank(row[iCodeIdx]) ?? '')
    seen.add(`${row[chainIdx]}|${seq}|${iCode}`)
  }
  return seen.size
}

// PaeConstraintsProcessor.load_pae_data + validate_alignment. Returns the
// matrix size, an error for a PAE file the worker would reject, or null when
// the file is not valid JSON (jsonFileCheck reports that).
const getPaeMatrixSize = (
  text: string
): { size: number } | { error: string } | null => {
  // load_pae_data unwraps a top-level list by stripping its brackets
  const body =
    text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  const obj =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  const key = ['predicted_aligned_error', 'pae', 'pde'].find((k) => k in obj)
  if (!key) {
    return {
      error:
        "PAE file must contain a 'predicted_aligned_error', 'pae' or 'pde' matrix."
    }
  }
  const matrix = obj[key]
  const n = Array.isArray(matrix) ? matrix.length : 0
  const square =
    n > 0 &&
    (matrix as unknown[]).every((row) => Array.isArray(row) && row.length === n)
  if (!square) {
    return { error: `The '${key}' matrix in the PAE file is not square.` }
  }
  return { size: n }
}

const checkPaeMatchesStructure = async (
  paeFile: Express.Multer.File,
  structureFile: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  let paeText: string
  let structureText: string
  try {
    ;[paeText, structureText] = await Promise.all([
      fs.readFile(paeFile.path, 'utf8'),
      fs.readFile(structureFile.path, 'utf8')
    ])
  } catch {
    // Unreadable uploads are reported by the per-file checks
    return { valid: true }
  }

  const pae = getPaeMatrixSize(paeText)
  if (pae === null) return { valid: true }
  if ('error' in pae) return { valid: false, message: pae.error }

  const isCif = structureFile.originalname?.toLowerCase().endsWith('.cif')
  const residues = isCif
    ? countCifResidues(structureText)
    : countPdbResidues(structureText)
  if (residues === 0 || residues === pae.size) return { valid: true }

  return {
    valid: false,
    message:
      `The PAE matrix is ${pae.size} × ${pae.size} but the structure has ${residues} residues. ` +
      'Upload the PAE file and structure from the same AlphaFold model, and remove ' +
      'residues the model does not include (glycans, ligands, waters, tags).'
  }
}

export {
  fromCharmmGui,
  isCRD,
  isPsfData,
  noSpaces,
  isSaxsData,
  isRNA,
  containsChainId,
  cifContainsChainId,
  checkPdbResidues,
  checkCifResidues,
  isSingleModel,
  isValidConstInpFile,
  countPdbResidues,
  countCifResidues,
  getPaeMatrixSize,
  checkPaeMatchesStructure
}
