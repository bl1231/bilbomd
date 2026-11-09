import { ChangeEvent, FocusEvent, useState, useEffect } from 'react'
import {
  Box,
  Chip,
  TextField,
  Typography,
  IconButton,
  Button,
  MenuItem
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import Grid from '@mui/material/Grid'
import { grey } from '@mui/material/colors'
import { Theme, useTheme } from '@mui/material/styles'
import { Field, FieldArray, FormikErrors, FormikTouched } from 'formik'
import { OpenFoldEntity, NewOpenFoldJobFormValues } from 'types/openfoldForm'
import {
  OPENFOLD_TOKEN_LIMITS,
  type MoleculeType,
  type TokenLimits
} from './entityLimits'

// Sequence entities editor shared by the sequence-in job forms (OpenFold3,
// BioEmu2): molecule type, copies and a chunked sequence display per entity,
// plus a token-count chip.

function chunkSequenceHTML(seq: string): string {
  if (!seq) return ''
  const chunkSize = 10
  let out = ''
  let i = 0

  while (i < seq.length) {
    const end = Math.min(i + chunkSize, seq.length)
    const chunk = seq.slice(i, end)
    const paddedEnd = String(end).padStart(3, '0')
    out += `${chunk}<sup>${paddedEnd}</sup>`
    if (end < seq.length) {
      out += ' '
    }
    i = end
  }
  return out
}

export function SequenceField(props: {
  label: string
  name: string
  rawValue: string
  touched?: boolean
  error?: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onBlur: (e: FocusEvent<HTMLInputElement>) => void
  disabled?: boolean
}) {
  const { label, name, rawValue, touched, error, onChange, onBlur, disabled } =
    props

  const [isFocused, setIsFocused] = useState(false)
  const [displayValue, setDisplayValue] = useState(rawValue)

  useEffect(() => {
    setDisplayValue(rawValue)
  }, [rawValue])

  const handleFocus = () => {
    if (!disabled) {
      setIsFocused(true)
    }
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    onBlur(e)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value)
    onChange(e)
  }

  if (isFocused) {
    return (
      <Box sx={{ width: '100%' }}>
        <TextField
          fullWidth
          multiline
          variant="outlined"
          label={label}
          name={name}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          error={Boolean(error && touched)}
          helperText={error && touched ? error : ''}
        />
      </Box>
    )
  } else {
    const chunkedHTML = chunkSequenceHTML(displayValue)

    return (
      <Box sx={{ width: '100%' }}>
        <Box
          tabIndex={disabled ? -1 : 0}
          onFocus={handleFocus}
          onClick={() => !disabled && setIsFocused(true)}
          sx={{
            minHeight: '54px',
            border: `1px solid ${grey[300]}`,
            borderRadius: '4px',
            p: 1,
            cursor: disabled ? 'default' : 'text',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            letterSpacing: '0.08em',
            fontSize: '0.9rem',
            color: disabled ? 'text.disabled' : 'text.primary',
            opacity: disabled ? 0.6 : 1
          }}
          dangerouslySetInnerHTML={{ __html: chunkedHTML }}
        />
        {error && touched && (
          <Typography
            variant="body2"
            color="error"
            sx={{ mt: 0.5 }}
          >
            {error}
          </Typography>
        )}
      </Box>
    )
  }
}

const getChipColor = (
  count: number,
  theme: Theme,
  limits: TokenLimits
): string => {
  if (count <= limits.warn) return theme.palette.success.main
  if (count <= limits.max) return theme.palette.warning.main
  return theme.palette.error.main
}

const getSequenceLabel = (entityType: string, seqLength: number): string => {
  if (entityType === 'DNA') return `DNA Sequence (${seqLength})`
  if (entityType === 'RNA') return `RNA Sequence (${seqLength})`
  return `Amino Acid Sequence (${seqLength})`
}

const EntitiesFieldArray = ({
  values,
  errors,
  touched,
  handleChange,
  handleBlur,
  setFieldValue,
  useExampleData,
  moleculeTypes = ['Protein', 'DNA', 'RNA'],
  tokenLimits = OPENFOLD_TOKEN_LIMITS
}: {
  values: NewOpenFoldJobFormValues
  errors: FormikErrors<NewOpenFoldJobFormValues>
  touched: FormikTouched<NewOpenFoldJobFormValues>
  handleBlur: (e: FocusEvent<Element>) => void
  handleChange: (e: ChangeEvent<Element>) => void
  setFieldValue: (
    field: string,
    value: string | number,
    shouldValidate?: boolean
  ) => void
  useExampleData: boolean
  // Molecule types offered in each entity's type menu
  moleculeTypes?: MoleculeType[]
  tokenLimits?: TokenLimits
}) => {
  const theme = useTheme()
  return (
    <FieldArray name="entities">
      {({ push, remove }) => {
        const generateName = (type: string, id: string) => {
          const typePrefix = type.toLowerCase().substring(0, 3)
          return `${typePrefix}-${id}`
        }

        const getNextId = () => {
          const highestId = values.entities.reduce((maxId, entity) => {
            const currentId = parseInt(entity.id, 10)
            return currentId > maxId ? currentId : maxId
          }, 0)
          return (highestId + 1).toString()
        }

        const totalCharactersWithCopies = values.entities.reduce(
          (acc, entity) =>
            acc + (entity.sequence?.length || 0) * (entity.copies || 1),
          0
        )

        return (
          <Grid
            container
            sx={{ flexDirection: 'column' }}
          >
            <Box>
              {values.entities.map((entity, index) => {
                const seqError =
                  errors.entities &&
                  errors.entities[index] &&
                  typeof errors.entities[index] !== 'string' &&
                  (errors.entities[index] as FormikErrors<OpenFoldEntity>)
                    .sequence
                const seqTouched =
                  touched.entities &&
                  touched.entities[index] &&
                  typeof touched.entities[index] !== 'string' &&
                  (touched.entities[index] as FormikTouched<OpenFoldEntity>)
                    .sequence

                return (
                  <Box
                    key={index}
                    sx={{
                      mb: 2,
                      display: 'flex',
                      alignItems: 'start',
                      flexWrap: { xs: 'wrap', md: 'nowrap' },
                      rowGap: 1
                    }}
                  >
                    {/* Molecule Type */}
                    <TextField
                      select
                      name={`entities.${index}.type`}
                      label="Molecule Type"
                      fullWidth
                      variant="outlined"
                      value={entity.type || 'Protein'}
                      disabled={useExampleData}
                      onChange={(e) => {
                        handleChange(e)
                        const newName = generateName(e.target.value, entity.id)
                        setFieldValue(`entities.${index}.name`, newName)
                      }}
                      sx={{
                        width: '200px',
                        marginRight: 2,
                        '& .MuiInputBase-root': {
                          height: '54px',
                          alignItems: 'center'
                        }
                      }}
                    >
                      {moleculeTypes.map((type) => (
                        <MenuItem
                          key={type}
                          value={type}
                        >
                          {type}
                        </MenuItem>
                      ))}
                    </TextField>

                    {/* Copies Field */}
                    <Field
                      as={TextField}
                      name={`entities.${index}.copies`}
                      label="Copies"
                      type="number"
                      disabled={useExampleData}
                      slotProps={{
                        input: { sx: { height: '100%' } },
                        htmlInput: { min: 1, step: 1 }
                      }}
                      fullWidth
                      variant="outlined"
                      onChange={handleChange}
                      onBlur={handleBlur}
                      value={entity.copies || 1}
                      sx={{ width: '100px', marginRight: 2, height: '54px' }}
                    />

                    {/* Sequence Field */}
                    <Box sx={{ flex: 1, marginRight: 2 }}>
                      <SequenceField
                        label={getSequenceLabel(
                          entity.type,
                          entity.sequence?.length || 0
                        )}
                        name={`entities.${index}.sequence`}
                        rawValue={entity.sequence || ''}
                        error={seqError as string}
                        touched={Boolean(seqTouched)}
                        disabled={useExampleData}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const newSeq = e.target.value
                          setFieldValue(`entities.${index}.sequence`, newSeq)
                          setFieldValue(
                            `entities.${index}.seq_length`,
                            newSeq.length
                          )
                        }}
                        onBlur={handleBlur}
                      />
                    </Box>

                    <IconButton
                      onClick={() => {
                        if (values.entities.length === 1) {
                          remove(index)
                          push({
                            id: `${index + 1}`,
                            name: generateName('Protein', `${index + 1}`),
                            sequence: '',
                            type: 'Protein',
                            copies: 1,
                            seq_length: 0
                          })
                        } else {
                          remove(index)
                        }
                      }}
                      sx={{ marginLeft: 1 }}
                    >
                      <Delete />
                    </IconButton>
                  </Box>
                )
              })}

              <Button
                variant="contained"
                color="primary"
                startIcon={<Add />}
                onClick={() =>
                  push({
                    id: getNextId(),
                    name: generateName('Protein', getNextId()),
                    sequence: '',
                    type: 'Protein',
                    copies: 1,
                    seq_length: 0
                  })
                }
              >
                Add Entity
              </Button>
            </Box>
            <Box>
              <Chip
                label={`Token count: ${totalCharactersWithCopies}`}
                variant="outlined"
                sx={{
                  mt: 1,
                  height: '36px',
                  width: '150px',
                  fontSize: '0.9rem',
                  color: 'white',
                  backgroundColor: getChipColor(
                    totalCharactersWithCopies,
                    theme,
                    tokenLimits
                  ),
                  borderColor: getChipColor(
                    totalCharactersWithCopies,
                    theme,
                    tokenLimits
                  )
                }}
              />
            </Box>
          </Grid>
        )
      }}
    </FieldArray>
  )
}

export default EntitiesFieldArray
