import * as yup from 'yup'
import {
  requiredFile,
  fileExtTest,
  fileSizeTest,
  fileNameLengthTest,
  noSpacesTest,
  saxsCheck
} from './helpers/fileValidators.js'

const alphafoldEntitySchema = yup.object({
  id: yup.string().required(),
  name: yup.string().required(),
  sequence: yup
    .string()
    .matches(/^[ACDEFGHIKLMNPQRSTVWY]+$/, 'Invalid amino acid sequence')
    .required(),
  type: yup.string().oneOf(['Protein', 'DNA', 'RNA']).required(),
  copies: yup.number().integer().min(1).required()
})

const alphafoldEntitiesSchema = yup
  .array()
  .of(alphafoldEntitySchema)
  .max(20, 'A maximum of 20 entities are allowed')

export const alphafoldJobSchema = yup.object({
  title: yup.string().required('Job title is required').max(100, 'Title too long'),
  bilbomd_mode: yup.string().oneOf(['alphafold'], 'Invalid mode').required(),
  email: yup.string().email('Invalid email address').optional(),
  dat_file: requiredFile('Experimental SAXS data is required')
    .concat(fileSizeTest(2_000_000))
    .concat(fileExtTest('dat'))
    .concat(saxsCheck())
    .concat(noSpacesTest())
    .concat(fileNameLengthTest()),
  entities: alphafoldEntitiesSchema
})
