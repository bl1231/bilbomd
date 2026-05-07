import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck
} from './helpers/fileValidators.js'

const proteinSeqRegex = /^[ACDEFGHIKLMNPQRSTVWY]+$/
const dnaSeqRegex = /^[ACGT]+$/
const rnaSeqRegex = /^[ACGU]+$/

const openfoldEntitySchema = yup.object({
  id: yup.string().required(),
  name: yup.string().required(),
  sequence: yup
    .string()
    .required()
    .test('valid-sequence', 'Invalid sequence for the selected molecule type', function (value) {
      const { type } = this.parent
      if (!value) return false
      if (type === 'Protein') return proteinSeqRegex.test(value)
      if (type === 'DNA') return dnaSeqRegex.test(value)
      if (type === 'RNA') return rnaSeqRegex.test(value)
      return false
    }),
  type: yup.string().oneOf(['Protein', 'DNA', 'RNA']).required(),
  copies: yup.number().integer().min(1).required()
})

const openfoldEntitiesSchema = yup
  .array()
  .of(openfoldEntitySchema)
  .max(20, 'A maximum of 20 entities are allowed')

export const openfoldJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['openfold'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  entities: openfoldEntitiesSchema
})
