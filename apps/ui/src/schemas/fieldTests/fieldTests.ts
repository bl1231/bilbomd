import { mixed, string } from 'yup'
import {
  isQUnits,
  Q_UNITS,
  SAXS_MAX_FILE_SIZE,
  findLowercaseResidueNames,
  residueCaseMessage,
  sharedResidueNumbersMessage,
  paeResidueMismatchMessage
} from '@bilbomd/bilbomd-types'
import {
  noSpaces,
  isSansData,
  analyzeSaxsFile,
  isValidConstInpFile,
  isOpenMMConstInpFile,
  hasAllowedResiduesOnly,
  isPsfData,
  isCRD,
  isSingleModel,
  cifIsSingleModel,
  containsChainId,
  cifContainsChainId,
  cifHasAllowedResiduesOnly,
  noLeadingSpaceOnPDBLines,
  findSharedResidueNumbersInFile,
  getPaeFileMatrixSize,
  countStructureFileResidues
} from '../ValidationFunctions'

const isFileOrString = (file: unknown): boolean =>
  typeof file === 'string' || file instanceof File

export const fileSizeTest = (maxSize: number) =>
  mixed().test(
    'file-size-check',
    `Max file size is ${maxSize / 1_000_000}MB`,
    (file) => {
      if (file instanceof File) return file.size <= maxSize
      return typeof file === 'string'
    }
  )

export const fileNameLengthTest = () =>
  mixed().test(
    'filename-length-check',
    'Filename must be no longer than 30 characters.',
    (file) => {
      if (file instanceof File) return file.name.length <= 30
      if (typeof file === 'string') return file.length <= 30
      return false
    }
  )

export const noSpacesTest = () =>
  mixed().test(
    'check-for-spaces',
    'No spaces allowed in the file name.',
    async (file) => {
      if (file instanceof File) return noSpaces(file)
      return true // allow string fallback
    }
  )

export const fileExtTest = (ext: string) =>
  mixed().test('file-type-check', `Only accepts a *.${ext} file.`, (file) => {
    if (file instanceof File)
      return file.name.split('.').pop()?.toLowerCase() === ext.toLowerCase()
    return typeof file === 'string'
  })

export const requiredFile = (message: string) =>
  mixed().test('required', message, isFileOrString)

// Specialized file content checks (for async validators)
export const saxsCheck = () =>
  mixed().test(
    'saxs-data-check',
    'File does not appear to be SAXS data',
    async function (file) {
      // Oversized files are reported by fileSizeTest; don't read them
      if (file instanceof File && file.size <= SAXS_MAX_FILE_SIZE) {
        // q_units is a sibling field of the file in every job form
        const qUnits: unknown = this.parent?.q_units
        const result = await analyzeSaxsFile(
          file,
          isQUnits(qUnits) ? qUnits : 'auto'
        )
        if (result.valid) return true
        return this.createError({ message: result.message })
      }
      return true // allow string fallback
    }
  )

// Units of q in the uploaded SAXS data. 'auto' detects them.
export const qUnitsField = () =>
  string().oneOf([...Q_UNITS], 'Please select the q units')

// SANS data still uses the legacy first-q check
export const sansCheck = () =>
  mixed().test(
    'sans-data-check',
    'File does not appear to be SANS data',
    async function (file) {
      if (file instanceof File) {
        const result = await isSansData(file)
        if (result.valid) return true
        return this.createError({ message: result.message })
      }
      return true // allow string fallback
    }
  )

export const psfCheck = () =>
  mixed().test(
    'psf-data-check',
    'File may not be a valid PSF file',
    async (file) => {
      if (file instanceof File) return isPsfData(file)
      return true
    }
  )

export const crdCheck = () =>
  mixed().test(
    'crd-check',
    'File may not be a valid CRD file',
    async (file) => {
      if (file instanceof File) return isCRD(file)
      return true
    }
  )

// Names that only need uppercasing (e.g. 'ala') get their own message: the
// fix is to edit the file, not to add a residue
const unsupportedResiduesMessage = (unsupported: string[]): string => {
  const lowercase = findLowercaseResidueNames(unsupported)
  const unknown = unsupported.filter((name) => !lowercase.includes(name))
  const caseNote = lowercase.length > 0 ? residueCaseMessage(lowercase) : ''
  if (unknown.length === 0) return caseNote
  return `Unsupported residues found: ${unknown.join(', ')} Please ask Scott to add them to the list of supported residues.${caseNote ? ` ${caseNote}` : ''}`
}

export const pdbCheck = () =>
  mixed().test('pdb-check', '', async function (file) {
    const { path, createError } = this

    if (!(file instanceof File)) return true

    const result = await hasAllowedResiduesOnly(file)
    if (result.valid) return true

    return createError({
      path,
      message: unsupportedResiduesMessage(result.unsupportedResidues)
    })
  })

export const chainIdCheck = () =>
  mixed().test(
    'pdb-chainid-check',
    'Missing Chain ID in column 22',
    async (file) => {
      if (file instanceof File) return containsChainId(file)
      return true
    }
  )

export const pdbLineStartCheck = () =>
  mixed().test(
    'pdb-line-start-check',
    'PDB file contains lines with invalid leading spaces (e.g., " ATOM" instead of "ATOM")',
    async (file) => {
      if (file instanceof File) return noLeadingSpaceOnPDBLines(file)
      return true
    }
  )

export const singleModelCheck = () =>
  mixed().test(
    'single-model-check',
    'File contains multiple models. Please provide a single-model file.',
    async (file) => {
      if (!(file instanceof File)) return true
      const isCif = file.name.toLowerCase().endsWith('.cif')
      return isCif ? cifIsSingleModel(file) : isSingleModel(file)
    }
  )

// `mode` sets the segment ID rule. Without it, the rule follows the form's
// bilbomd_mode (the Classic form switches between pdb and crd_psf).
export const constInpCheck = (mode?: 'pdb' | 'crd_psf') =>
  mixed().test('const-inp-file-check', '', async function (file, ctx) {
    const inputMode: string | undefined =
      mode ?? ctx?.options?.context?.bilbomd_mode
    if (file instanceof File) {
      const result = await isValidConstInpFile(file, inputMode ?? '')
      if (result === true) return true
      return this.createError({ message: result })
    }
    return true
  })

/**
 * For OpenMM jobs: every constraint in the const.inp must reach OpenMM, as the
 * upload check requires. Uses the sibling md_engine ('openmm' | 'charmm');
 * CHARMM reads the file itself.
 */
export const openmmConstInpCheck = () =>
  mixed().test('openmm-const-inp-check', '', async function (file) {
    if (!(file instanceof File) || this.parent?.md_engine !== 'openmm') {
      return true
    }
    const result = await isOpenMMConstInpFile(file)
    if (result === true) return true
    return this.createError({ message: result })
  })

export const jsonFileCheck = () =>
  mixed().test(
    'is-json',
    'Please select a PAE file in JSON format',
    async (file) => {
      if (file instanceof File && file.type === 'application/json') {
        const content = await file.text()
        try {
          JSON.parse(content)
          return true
        } catch {
          return false
        }
      }
      return typeof file === 'string' // allow reuse of existing string
    }
  )

export const pdbOrCifExtTest = () =>
  mixed().test(
    'file-type-check',
    'Only accepts a *.pdb or *.cif file.',
    (file) => {
      if (file instanceof File) {
        const ext = file.name.split('.').pop()?.toLowerCase()
        return ext === 'pdb' || ext === 'cif'
      }
      return typeof file === 'string'
    }
  )

export const pdbOrCifChainIdCheck = () =>
  mixed().test('pdb-or-cif-chainid-check', 'Missing Chain ID', async (file) => {
    if (!(file instanceof File)) return true
    const isCif = file.name.toLowerCase().endsWith('.cif')
    return isCif ? cifContainsChainId(file) : containsChainId(file)
  })

export const pdbOrCifResidueCheck = () =>
  mixed().test('pdb-or-cif-residue-check', '', async function (file) {
    if (!(file instanceof File)) return true
    const isCif = file.name.toLowerCase().endsWith('.cif')
    const result = isCif
      ? await cifHasAllowedResiduesOnly(file)
      : await hasAllowedResiduesOnly(file)
    if (!result.valid) {
      return this.createError({
        message: unsupportedResiduesMessage(result.unsupportedResidues)
      })
    }
    // Like the backend, only PDB files are checked for shared numbers
    const shared = isCif ? [] : await findSharedResidueNumbersInFile(file)
    if (shared.length > 0) {
      return this.createError({ message: sharedResidueNumbersMessage(shared) })
    }
    return true
  })

// Runs on pae_file and compares it with the pdb_file sibling field, as the
// backend does. Formik re-validates every field on each change, so the error
// updates when either file changes.
export const paeMatchesStructureCheck = () =>
  mixed().test('pae-matches-structure', '', async function (file) {
    const structure: unknown = this.parent?.pdb_file
    // A file reused on resubmit is a name, not a File: the backend checks it
    if (!(file instanceof File) || !(structure instanceof File)) return true
    const pae = await getPaeFileMatrixSize(file)
    // Invalid JSON is reported by jsonFileCheck
    if (pae === null) return true
    if ('error' in pae) return this.createError({ message: pae.error })
    const message = paeResidueMismatchMessage(
      pae.size,
      await countStructureFileResidues(structure)
    )
    return message ? this.createError({ message }) : true
  })
