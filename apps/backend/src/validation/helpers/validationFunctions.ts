import fs from 'fs/promises'
import {
  parseCifAtomSite,
  cifContainsChainId as cifContainsChainIdUtil,
  cifHasAllowedResiduesOnly as cifHasAllowedResiduesOnlyUtil,
  cifIsSingleModel as cifIsSingleModelUtil,
  analyzeSaxsData,
  isFromCharmmGui,
  isCrdText,
  isPsfText,
  pdbContainsChainId,
  pdbIsSingleModel,
  findUnsupportedPdbResidues,
  findSharedResidueNumbers,
  checkRnaResidues,
  checkConstInpText
} from '@bilbomd/bilbomd-types'
import type { QUnits, SaxsDataAnalysis } from '@bilbomd/bilbomd-types'
import { logger } from '../../middleware/loggers.js'

// The file checks themselves live in @bilbomd/bilbomd-types, shared with the
// job forms. These wrappers read the upload and run them.

// An upload's text, or null when it cannot be read
const readUpload = async (
  file: Express.Multer.File
): Promise<string | null> => {
  try {
    return await fs.readFile(file.path, 'utf8')
  } catch {
    return null
  }
}

const fromCharmmGui = async (file: Express.Multer.File): Promise<boolean> => {
  const text = await readUpload(file)
  return text !== null && isFromCharmmGui(text)
}

const isCRD = async (file: Express.Multer.File): Promise<boolean> => {
  const text = await readUpload(file)
  return text !== null && isCrdText(text)
}

const isPsfData = async (file: Express.Multer.File): Promise<boolean> => {
  const text = await readUpload(file)
  return text !== null && isPsfText(text)
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
  const text = await readUpload(file)
  return text !== null && pdbContainsChainId(text)
}

const isRNA = async (
  file: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  const text = await readUpload(file)
  if (text === null) return { valid: false, message: 'Error reading the file.' }
  return checkRnaResidues(text)
}

const checkPdbResidues = async (
  file: Express.Multer.File
): Promise<{ valid: boolean; message?: string }> => {
  const text = await readUpload(file)
  if (text === null) return { valid: false, message: 'Error reading PDB file.' }

  const unsupported = findUnsupportedPdbResidues(text)
  if (unsupported.length > 0) {
    return {
      valid: false,
      message: `PDB contains unsupported residues: ${unsupported.join(', ')}. These cannot be processed by BilboMD.`
    }
  }

  const shared = findSharedResidueNumbers(text)
  if (shared.length > 0) {
    const shown = shared.slice(0, 3).join(', ')
    const more = shared.length > 3 ? ` and ${shared.length - 3} more` : ''
    return {
      valid: false,
      message: `PDB has residues that share a chain and residue number: ${shown}${more}. Give each residue its own number within its chain (for example, number sugars and ligands after the last protein residue).`
    }
  }

  return { valid: true }
}

const isValidConstInpFile = async (
  file: Express.Multer.File,
  mode: string
): Promise<string | true> => {
  const text = await readUpload(file)
  if (text === null) return 'Error reading file'
  return checkConstInpText(text, mode)
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

// A file with more than one model (PDB MODEL records or CIF model numbers) is
// rejected: see pdbIsSingleModel in @bilbomd/bilbomd-types
const isSingleModel = async (file: Express.Multer.File): Promise<boolean> => {
  const text = await readUpload(file)
  if (text === null) return false
  if (file.originalname?.toLowerCase().endsWith('.cif')) {
    const parsed = parseCifAtomSite(text)
    // No _atom_site block: the residue check reports that
    return parsed === null || cifIsSingleModelUtil(parsed)
  }
  return pdbIsSingleModel(text)
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
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  // load_pae_data unwraps a top-level list by stripping its brackets, which
  // only yields valid JSON when the list holds exactly one object
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      data = JSON.parse(text.slice(1, -1))
    } catch {
      return {
        error:
          'PAE file must be a JSON object, or a list holding exactly one object.'
      }
    }
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
