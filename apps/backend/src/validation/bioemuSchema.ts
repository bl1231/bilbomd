import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck,
  qUnitsField
} from './helpers/fileValidators.js'

// BilboMD BioEmu2 (bilbomd#1200). Entities have the same shape as OpenFold3's.
// Protein and DNA only: BioEmu2 also takes RNA, but no RNA system has been
// benchmarked yet.

const proteinSeqRegex = /^[ACDEFGHIKLMNPQRSTVWY]+$/
const dnaSeqRegex = /^[ACGT]+$/

// Sampling time and GPU memory grow with the square of the system size
// (residues + nucleotides, times copies). Phase 0 covered up to ~820; ~1,600
// fits on an 80 GB A100 but takes hours.
export const BIOEMU_DEFAULT_MAX_TOKENS = 1000

export const bioemuMaxTokens = (): number => {
  const fromEnv = parseInt(process.env.BIOEMU_MAX_TOKENS ?? '', 10)
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : BIOEMU_DEFAULT_MAX_TOKENS
}

export const countBioEmuTokens = (
  entities: { sequence?: string; copies?: number }[] = []
): number =>
  entities.reduce(
    (sum, e) => sum + (e.sequence?.length ?? 0) * (Number(e.copies) || 0),
    0
  )

const bioemuEntitySchema = yup.object({
  name: yup.string().required(),
  sequence: yup
    .string()
    .required()
    .test(
      'valid-sequence',
      'Invalid sequence for the selected molecule type',
      function (value) {
        const { type } = this.parent
        if (!value) return false
        if (type === 'Protein') return proteinSeqRegex.test(value)
        if (type === 'DNA') return dnaSeqRegex.test(value)
        return false
      }
    ),
  type: yup
    .string()
    .oneOf(['Protein', 'DNA'], 'BioEmu2 jobs accept Protein and DNA entities')
    .required(),
  copies: yup.number().integer().min(1).max(20).required()
})

export const bioemuJobSchema = yup.object({
  title: yup
    .string()
    .required('Job title is required')
    .max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['bioemu'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  q_units: qUnitsField(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  entities: yup
    .array()
    .of(bioemuEntitySchema)
    .min(1, 'At least one entity is required')
    .max(20, 'A maximum of 20 entities are allowed')
    .test(
      'has-protein',
      'At least one Protein entity is required (Rg steering acts on protein)',
      (entities) => (entities ?? []).some((e) => e?.type === 'Protein')
    )
    .test('max-size', function (entities) {
      const tokens = countBioEmuTokens(entities ?? [])
      const max = bioemuMaxTokens()
      return tokens <= max
        ? true
        : this.createError({
            message: `The system has ${tokens} residues and nucleotides (counting copies); BioEmu2 jobs are limited to ${max}`
          })
    })
    .required()
})
