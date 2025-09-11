import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  constInpCheck,
  chainIdCheck
} from './helpers/fileValidators.js'

export const pdbJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['pdb'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  const_inp_file: requiredFile('const.inp file is required')
    .concat(constInpCheck())
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('inp'))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  pdb_file: requiredFile('PDB file is required')
    .concat(chainIdCheck())
    .concat(fileExtTest('pdb'))
    .concat(fileSizeTest(10_000_000))
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
