import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  jsonFileCheck,
  chainIdCheck
} from './helpers/fileValidators.js'

export const autoJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['auto'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  pdb_file: requiredFile('A PDB file is required')
    .concat(chainIdCheck())
    .concat(fileExtTest('pdb'))
    .concat(fileSizeTest(10_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  pae_file: requiredFile('A PAE *.json file is required')
    .concat(jsonFileCheck())
    .concat(fileExtTest('json'))
    .concat(fileSizeTest(120_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(saxsCheck())
    .concat(fileExtTest('dat'))
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  rg: yup.number().integer().positive().min(10).max(100).required('Rg value is required'),
  rg_min: yup
    .number()
    .integer()
    .positive()
    .min(10)
    .max(100)
    .required('Rg min value is required'),
  rg_max: yup
    .number()
    .integer()
    .positive()
    .min(10)
    .max(100)
    .required('Rg max value is required')
    .test(
      'is-greater',
      'Rg Maximum must be at least 1 Å greater than Rg Minimum',
      function (value) {
        const { rg_min } = this.parent
        return value > rg_min
      }
    )
})
