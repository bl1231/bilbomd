import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  constInpCheck,
  crdCheck,
  psfCheck
} from './helpers/fileValidators.js'

export const crdJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['crd_psf'], 'Invalid mode').required(),
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
  crd_file: requiredFile('A CRD file is required')
    .concat(fileSizeTest(20_000_000))
    .concat(fileExtTest('crd'))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest())
    .concat(crdCheck()),
  psf_file: requiredFile('A PSF file is required')
    .concat(fileSizeTest(30_000_000))
    .concat(fileExtTest('psf'))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest())
    .concat(psfCheck()),
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
