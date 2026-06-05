import * as yup from 'yup'
import {
  requiredFile,
  fileSizeTest,
  fileExtTest,
  fileNameLengthTest,
  noSpacesTest,
  noShellMetacharsTest,
  saxsCheck,
  pdbOrCifExtTest,
  pdbOrCifChainIdCheck,
  pdbOrCifResidueCheck
} from './helpers/fileValidators.js'

export const scoperJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['scoper'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(noShellMetacharsTest())
    .concat(fileNameLengthTest()),
  pdb_file: requiredFile('A PDB or CIF file is required')
    .concat(pdbOrCifChainIdCheck())
    .concat(pdbOrCifResidueCheck())
    .concat(pdbOrCifExtTest())
    .concat(fileSizeTest(10_000_000))
    .concat(noSpacesTest())
    .concat(noShellMetacharsTest())
    .concat(fileNameLengthTest())
})
