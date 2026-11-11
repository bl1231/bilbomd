import * as yup from 'yup'
import {
  requiredFile,
  fileSizeTest,
  fileExtTest,
  fileNameLengthTest,
  noSpacesTest,
  constInpCheck,
  pdbOrCifExtTest,
  pdbOrCifChainIdCheck,
  pdbOrCifResidueCheck,
  singleModelCheck
} from './helpers/fileValidators.js'

const rgField = (label: string) =>
  yup
    .number()
    .integer()
    .positive()
    .min(10)
    .max(100)
    .required(`${label} value is required`)

// Mirrors the SANS job form (apps/ui/src/schemas/BilboMDSANSJobSchema.ts).
// The form's SANS data content check runs in the browser only.
export const sansJobSchema = yup.object({
  title: yup
    .string()
    .required('Job title is required')
    .max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['sans'], 'Invalid mode').required(),
  pdb_file: requiredFile('A PDB or CIF file is required')
    .concat(pdbOrCifChainIdCheck())
    .concat(singleModelCheck())
    .concat(pdbOrCifResidueCheck())
    .concat(pdbOrCifExtTest())
    .concat(fileSizeTest(20_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  dat_file: requiredFile('Experimental SANS data is required')
    .concat(fileExtTest('dat'))
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  inp_file: requiredFile('const.inp file is required')
    .concat(fileExtTest('inp'))
    // SANS jobs start from a PDB file, so segment IDs follow the PDB rule
    .concat(constInpCheck('pdb'))
    .concat(fileSizeTest(2_000_000))
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  rg_min: rgField('Rg min'),
  rg_max: rgField('Rg max').test(
    'is-greater',
    'Rg Maximum must be at least 1 Å greater than Rg Minimum',
    function (value) {
      const { rg_min } = this.parent
      return value > rg_min
    }
  ),
  // Buffer D2O percentage; the worker passes d2o_fraction / 100 to Pepsi-SANS
  d2o_fraction: yup
    .number()
    .min(0, 'D2O Fraction cannot be less than 0')
    .max(100, 'D2O Fraction cannot be more than 100')
    .required('D2O Fraction is required')
})
