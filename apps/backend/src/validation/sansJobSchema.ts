import * as yup from 'yup'
import {
  requiredFile,
  fileSizeTest,
  fileExtTest,
  fileNameLengthTest,
  noSpacesTest,
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

// Chain IDs: 1-4 alphanumerics (PDB chainID or mmCIF auth_asym_id). The
// handler turns these into object keys, so nothing else gets through.
const CHAIN_ID_RE = /^[A-Za-z0-9]{1,4}$/

// Per-chain deuteration percentages, collected by the handler from the
// deuteration_fraction_<chainId> form fields. The form always sends one per
// chain. An empty set must be rejected here: Mongoose drops the empty object
// on save, and the worker can then never save the job again.
const deuterationFractions = yup
  .object()
  .test(
    'has-chains',
    'At least one deuteration_fraction_<chainId> field is required',
    (value) => !!value && Object.keys(value).length > 0
  )
  .test('valid-chains', function (value) {
    for (const [chainId, fraction] of Object.entries(value ?? {})) {
      if (!CHAIN_ID_RE.test(chainId)) {
        return this.createError({ message: `Invalid chain ID "${chainId}"` })
      }
      if (
        typeof fraction !== 'number' ||
        !Number.isFinite(fraction) ||
        fraction < 0 ||
        fraction > 100
      ) {
        return this.createError({
          message: `Deuteration fraction for chain ${chainId} must be a number from 0 to 100`
        })
      }
    }
    return true
  })

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
    .required('D2O Fraction is required'),
  deuteration_fractions: deuterationFractions
})
