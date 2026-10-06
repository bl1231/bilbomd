import { mixed, object } from 'yup'
import { SAXS_MAX_FILE_SIZE } from '@bilbomd/bilbomd-types'
import { noSpaces, isRNA } from './ValidationFunctions'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  qUnitsField
} from './fieldTests/fieldTests'
import { titleSchema } from './titleSchema'

export const bilbomdScoperJobSchema = object().shape({
  title: titleSchema('BilboMD Scoper Job'),

  pdb_file: mixed()
    .required('An RNA PDB file is required')
    .test('file-size-check', 'Max file size is 20MB', (file) => {
      if (file && (file as File).size <= 20000000) {
        return true
      }
      return false
    })
    .test('file-type-check', 'Please select a PDB file', (file) => {
      if (
        file &&
        (file as File).name.split('.').pop()?.toUpperCase() === 'PDB'
      ) {
        return true
      }
      return false
    })
    .test(
      'check-for-spaces',
      'Only accept file with no spaces in the name.',
      async (file) => {
        if (file) {
          const spaceCheck = await noSpaces(file as File)
          return spaceCheck
        }
        return false
      }
    )
    .test(
      'filename-length-check',
      'Filename must be no longer than 30 characters.',
      (file) => {
        if (file && (file as File).name.length <= 30) {
          return true
        }
        return false
      }
    )
    .test(
      'rna-data-check',
      'File does not meet RNA data requirements',
      async (file, { createError }) => {
        // destructuring the context from the test method arguments
        if (file) {
          const result = await isRNA(file as File)
          return result.valid ? true : createError({ message: result.message })
        }
        return createError({
          message: 'File is required but not provided.'
        })
      }
    ),
  q_units: qUnitsField(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(SAXS_MAX_FILE_SIZE))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(fileNameLengthTest())
})
