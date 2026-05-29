import type { Express } from 'express'
import { mixed } from 'yup'
import fs from 'fs/promises'
import {
  isSaxsData,
  isCRD,
  isPsfData,
  isValidConstInpFile,
  containsChainId,
  cifContainsChainId,
  checkPdbResidues,
  checkCifResidues
} from './validationFunctions.js'
import { logger } from '../../middleware/loggers.js'

export const requiredFile = (message: string) =>
  mixed().test('required', message, (file) => !!file && typeof file === 'object')

export const fileExtTest = (ext: string) =>
  mixed().test('file-type-check', `Only accepts a *.${ext} file.`, function (value) {
    const file = value as Express.Multer.File | undefined
    return file?.originalname?.toLowerCase().endsWith(`.${ext}`)
  })

export const fileSizeTest = (maxSize: number) =>
  mixed().test(
    'file-size-check',
    `Max file size is ${maxSize / 1_000_000}MB`,
    function (value) {
      const file = value as Express.Multer.File | undefined
      return file?.size != null && file.size <= maxSize
    }
  )

export const fileNameLengthTest = () =>
  mixed().test(
    'filename-length-check',
    'Filename must be no longer than 30 characters.',
    function (value) {
      const file = value as Express.Multer.File | undefined
      return file?.originalname?.length !== undefined && file.originalname.length <= 30
    }
  )

export const noSpacesTest = () =>
  mixed().test(
    'check-for-spaces',
    'No spaces allowed in the file name.',
    function (value) {
      const file = value as Express.Multer.File | undefined
      return !file?.originalname?.includes(' ')
    }
  )

export const noShellMetacharsTest = () =>
  mixed().test(
    'no-shell-metachar-check',
    'Filename contains disallowed characters.',
    function (value) {
      const file = value as Express.Multer.File | undefined
      if (!file?.originalname) return true
      return !/[;&|`$<>(){}!\r\n]/.test(file.originalname)
    }
  )

export const saxsCheck = () =>
  mixed().test(
    'saxs-data-check',
    'File does not appear to be SAXS data',
    async function (value) {
      const file = value as Express.Multer.File
      logger.info(`saxsCheck(): file = ${file?.originalname}, path = ${file?.path}`)

      if (!file?.path) {
        return this.createError({ message: 'Missing SAXS file path for validation.' })
      }

      try {
        const result = await isSaxsData(file)

        if (result.valid) return true

        return this.createError({ message: result.message ?? 'SAXS data invalid.' })
      } catch (err) {
        // Log what actually went wrong
        logger.error('Error in saxsCheck():', err)
        return this.createError({ message: 'Unexpected error during SAXS validation' })
      }
    }
  )

export const psfCheck = () =>
  mixed().test('psf-data-check', 'File may not be a valid PSF file', async (file) => {
    const psfFile = file as Express.Multer.File | undefined
    if (!psfFile?.path) return true
    return isPsfData(psfFile)
  })

export const crdCheck = () =>
  mixed().test('crd-check', 'File may not be a valid CRD file', async (file) => {
    const crdFile = file as Express.Multer.File | undefined
    if (!crdFile?.path) return true
    return isCRD(crdFile)
  })

export const chainIdCheck = () =>
  mixed().test('pdb-chainid-check', 'Missing Chain ID in column 22', async (file) => {
    const pdbFile = file as Express.Multer.File | undefined
    if (!pdbFile?.path) return true
    return containsChainId(pdbFile)
  })

export const pdbResidueCheck = () =>
  mixed().test('pdb-residue-check', 'PDB contains unsupported residues', async function (value) {
    const file = value as Express.Multer.File | undefined
    if (!file?.path) return true
    const result = await checkPdbResidues(file)
    if (result.valid) return true
    return this.createError({ message: result.message })
  })

export const constInpCheck = () =>
  mixed().test('const-inp-file-check', '', async function (file, ctx) {
    const mode = ctx?.options?.context?.bilbomd_mode
    const constInpFile = file as Express.Multer.File | undefined
    if (!constInpFile?.path) return true
    const result = await isValidConstInpFile(constInpFile, mode)
    if (result === true) return true
    return this.createError({ message: result })
  })

export const jsonFileCheck = () =>
  mixed().test('is-json', 'Please select a PAE file in JSON format', async (file) => {
    const jsonFile = file as Express.Multer.File | undefined
    if (!jsonFile?.path) return true
    try {
      const content = await fs.readFile(jsonFile.path, 'utf8')
      JSON.parse(content)
      return true
    } catch (error) {
      logger.error('Invalid JSON content:', error)
      return false
    }
  })

export const pdbOrCifExtTest = () =>
  mixed().test(
    'file-type-check',
    'Only accepts a *.pdb or *.cif file.',
    function (value) {
      const file = value as Express.Multer.File | undefined
      const name = file?.originalname?.toLowerCase()
      return name?.endsWith('.pdb') || name?.endsWith('.cif') || false
    }
  )

export const pdbOrCifChainIdCheck = () =>
  mixed().test(
    'pdb-or-cif-chainid-check',
    'Missing Chain ID',
    async function (value) {
      const file = value as Express.Multer.File | undefined
      if (!file?.path) return true
      const isCif = file.originalname?.toLowerCase().endsWith('.cif')
      return isCif ? cifContainsChainId(file) : containsChainId(file)
    }
  )

export const pdbOrCifResidueCheck = () =>
  mixed().test(
    'pdb-or-cif-residue-check',
    'File contains unsupported residues',
    async function (value) {
      const file = value as Express.Multer.File | undefined
      if (!file?.path) return true
      const isCif = file.originalname?.toLowerCase().endsWith('.cif')
      const result = isCif
        ? await checkCifResidues(file)
        : await checkPdbResidues(file)
      if (result.valid) return true
      return this.createError({ message: result.message })
    }
  )
