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
  findLowercaseResidueNames,
  residueCaseMessage,
  sharedResidueNumbersMessage,
  countPdbResidues,
  countCifResidues,
  getPaeMatrixSize,
  paeResidueMismatchMessage,
  checkRnaResidues,
  checkConstInpText,
  openmmConstInpMessage
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
  const lowercase = findLowercaseResidueNames(unsupported)
  const unknown = unsupported.filter((name) => !lowercase.includes(name))
  if (unknown.length > 0) {
    const caseNote =
      lowercase.length > 0 ? ` ${residueCaseMessage(lowercase)}` : ''
    return {
      valid: false,
      message: `PDB contains unsupported residues: ${unknown.join(', ')}. These cannot be processed by BilboMD.${caseNote}`
    }
  }
  if (lowercase.length > 0) {
    return { valid: false, message: residueCaseMessage(lowercase) }
  }

  const shared = findSharedResidueNumbers(text)
  if (shared.length > 0) {
    return { valid: false, message: sharedResidueNumbersMessage(shared) }
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

// Why OpenMM can't use this const.inp as it stands, or true
const isOpenMMConstInpFile = async (
  file: Express.Multer.File
): Promise<string | true> => {
  const text = await readUpload(file)
  if (text === null) return 'Error reading file'
  return openmmConstInpMessage(text) ?? true
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

// PAE ↔ structure size: see paeStructureChecks.ts in @bilbomd/bilbomd-types
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
  const message = paeResidueMismatchMessage(pae.size, residues)
  return message ? { valid: false, message } : { valid: true }
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
  isOpenMMConstInpFile,
  checkPaeMatchesStructure
}
