import { object, string, array, number } from 'yup'
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
import { countTokens } from 'features/shared/entities/entityLimits'

// Mirrors apps/backend/src/validation/bioemuSchema.ts: Protein and DNA only
// (RNA isn't benchmarked yet), at least one protein for the Rg steering, and
// the deployment's size limit (residues + nucleotides, counting copies).

export const BIOEMU_DEFAULT_MAX_TOKENS = 1000

const isAminoAcidSequence = (sequence: string) =>
  /^[ACDEFGHIKLMNPQRSTVWY]+$/i.test(sequence)

const isDnaSequence = (sequence: string) => /^[ACGT]+$/i.test(sequence)

export const makeBilboMDBioEmuJobSchema = (
  maxTokens: number = BIOEMU_DEFAULT_MAX_TOKENS
) =>
  object().shape({
    title: titleSchema('BilboMD Job'),
    q_units: qUnitsField(),
    dat_file: requiredFile('Experimental SAXS data is required')
      .concat(fileSizeTest(2_000_000))
      .concat(fileExtTest('dat'))
      .concat(saxsCheck())
      .concat(noSpacesTest())
      .concat(fileNameLengthTest()),
    entities: array()
      .of(
        object().shape({
          name: string(),
          sequence: string()
            .required('Please provide the sequence.')
            .min(10, 'Sequence must contain at least 10 characters.')
            .test(
              'is-valid-sequence',
              'Invalid character for the selected molecule type.',
              function (sequence) {
                const { type } = this.parent
                if (!sequence) return true
                if (type === 'Protein') return isAminoAcidSequence(sequence)
                if (type === 'DNA') return isDnaSequence(sequence)
                return true
              }
            ),
          type: string()
            .required('Please select a Molecule Type.')
            .oneOf(['Protein', 'DNA'], 'BioEmu2 jobs take Protein and DNA'),
          copies: number()
            .required('Please provide the number of copies.')
            .min(1, 'Copies must be at least 1.')
            .max(20, 'At most 20 copies.')
        })
      )
      .min(1, 'At least one entity is required.')
      .test(
        'has-protein',
        'At least one Protein entity is required: the Rg steering acts on protein.',
        (entities) => (entities ?? []).some((e) => e?.type === 'Protein')
      )
      .test('max-size', function (entities) {
        const tokens = countTokens(entities ?? [])
        return tokens <= maxTokens
          ? true
          : this.createError({
              message: `The system has ${tokens} residues and nucleotides (counting copies). BioEmu2 jobs are limited to ${maxTokens}.`
            })
      })
      .required('Entities are required')
  })
