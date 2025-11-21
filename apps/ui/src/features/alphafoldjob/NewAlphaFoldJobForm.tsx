import { ChangeEvent, FocusEvent, useState, useEffect } from 'react'
import {
  Box,
  Chip,
  TextField,
  Typography,
  Alert,
  Paper,
  IconButton,
  Button,
  MenuItem,
  Link
} from '@mui/material'
import { Add, Delete } from '@mui/icons-material'
import Grid from '@mui/material/Grid'
import { grey } from '@mui/material/colors'
import { Theme } from '@mui/material/styles'
import {
  Form,
  Formik,
  Field,
  FieldArray,
  FormikErrors,
  FormikTouched
} from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import { useAddNewAlphaFoldJobMutation } from 'slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import { BilboMDAlphaFoldJobSchema } from 'schemas/BilboMDAlphaFoldJobSchema'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import useTitle from 'hooks/useTitle'
import { Entity, NewAlphaFoldJobFormValues } from 'types/alphafoldForm'
import NewAlphaFoldJobFormInstructions from './NewAlphaFoldJobFormInstructions'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import { useTheme } from '@mui/material/styles'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'

type NewJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

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

function AminoAcidField(props: {
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

  // Sync rawValue if it changes from outside
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

  // If focused, show editable text field; otherwise, show HTML preview
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
        {/* Show error below if needed */}
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

const Instructions = () => (
  <Grid size={{ xs: 12 }}>
    <NewAlphaFoldJobFormInstructions />
  </Grid>
)

const PipelineSchematic = ({ isDarkMode }: { isDarkMode: boolean }) => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox>
      <Typography>BilboMD AF Schematic</Typography>
    </HeaderBox>
    <Paper sx={{ p: 2 }}>
      <img
        src={
          isDarkMode
            ? '/images/bilbomd-af-schematic-dark.png'
            : '/images/bilbomd-af-schematic.png'
        }
        alt="Overview of BilboMD AF pipeline"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </Paper>
  </Grid>
)

const getChipColor = (count: number, theme: Theme): string => {
  if (count <= 4000) return theme.palette.success.main
  if (count <= 6000) return theme.palette.warning.main
  return theme.palette.error.main
}

const EntitiesFieldArray = ({
  values,
  errors,
  touched,
  handleChange,
  handleBlur,
  setFieldValue,
  useExampleData
}: {
  values: NewAlphaFoldJobFormValues
  errors: FormikErrors<NewAlphaFoldJobFormValues>
  touched: FormikTouched<NewAlphaFoldJobFormValues>
  handleBlur: (e: FocusEvent<Element>) => void
  handleChange: (e: ChangeEvent<Element>) => void
  setFieldValue: (
    field: string,
    value: string | number,
    shouldValidate?: boolean
  ) => void
  useExampleData: boolean
}) => {
  const theme = useTheme()
  return (
    <FieldArray name="entities">
      {({ push, remove }) => {
        // Helper to generate name based on type + id
        const generateName = (type: string, id: string) => {
          const typePrefix = type.toLowerCase().substring(0, 3)
          return `${typePrefix}-${id}`
        }

        // Find the highest current `id` in the entities array
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
            direction="column"
          >
            <Box>
              {values.entities.map((entity, index) => {
                const seqError =
                  errors.entities &&
                  errors.entities[index] &&
                  typeof errors.entities[index] !== 'string' &&
                  (errors.entities[index] as FormikErrors<Entity>).sequence
                const seqTouched =
                  touched.entities &&
                  touched.entities[index] &&
                  typeof touched.entities[index] !== 'string' &&
                  (touched.entities[index] as FormikTouched<Entity>).sequence

                return (
                  <Box
                    key={index}
                    mb={2}
                    display="flex"
                    alignItems="start"
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
                      <MenuItem value="Protein">Protein</MenuItem>
                      <MenuItem
                        value="DNA"
                        disabled
                      >
                        DNA - pending AF3 availability
                      </MenuItem>
                      <MenuItem
                        value="RNA"
                        disabled
                      >
                        RNA - pending AF3 availability
                      </MenuItem>
                    </TextField>

                    {/* Copies Field */}
                    <Field
                      as={TextField}
                      name={`entities.${index}.copies`}
                      label="Copies"
                      type="number"
                      disabled={useExampleData}
                      InputProps={{
                        inputProps: { min: 1, step: 1 },
                        sx: { height: '100%' } // Ensure full height usage
                      }}
                      fullWidth
                      variant="outlined"
                      onChange={handleChange}
                      onBlur={handleBlur}
                      value={entity.copies || 1}
                      sx={{ width: '100px', marginRight: 2, height: '54px' }}
                    />

                    {/* AminoAcidField */}
                    <Box
                      flex={1}
                      marginRight={2}
                    >
                      <AminoAcidField
                        label={`Amino Acid Sequence (${
                          entity.sequence?.length || 0
                        })`}
                        name={`entities.${index}.sequence`}
                        rawValue={entity.sequence || ''}
                        error={seqError as string}
                        touched={Boolean(seqTouched)}
                        disabled={useExampleData}
                        // Pass the raw value to Formik
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const newSeq = e.target.value
                          setFieldValue(`entities.${index}.sequence`, newSeq)
                          // Also update seq_length
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
                          // If there's only one entity, reset it with a new blank entity
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
                          // Remove the entity as usual
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
                    theme
                  ),
                  borderColor: getChipColor(totalCharactersWithCopies, theme)
                }}
              />
            </Box>
          </Grid>
        )
      }}
    </FieldArray>
  )
}

const SubmitButton = ({
  isSubmitting,
  isValid,
  isFormValid,
  status
}: {
  isSubmitting: boolean
  isValid: boolean
  isFormValid: boolean
  status: string | undefined
}) => (
  <Grid sx={{ mt: 2 }}>
    <Button
      type="submit"
      disabled={!isValid || isSubmitting || !isFormValid}
      loading={isSubmitting}
      endIcon={<SendIcon />}
      loadingPosition="end"
      variant="contained"
      sx={{ width: '110px', mb: 2 }}
    >
      <span>Submit</span>
    </Button>
    {status?.startsWith('Error') ? (
      <Alert severity="error">{status.replace('Error: ', '')}</Alert>
    ) : (
      status && <Alert severity="success">{status}</Alert>
    )}
  </Grid>
)

const NewAlphaFoldJob = ({ mode = 'authenticated' }: NewJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New AlphaFold Job (anonymous)'
      : 'BilboMD: New AlphaFold Job'
  )
  // theme and dark mode detection
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'

  const [
    addNewAlphaFoldJob,
    { isSuccess: isAuthSuccess, data: authJobResponse }
  ] = useAddNewAlphaFoldJobMutation()
  const [addNewPublicJob, { isSuccess: isAnonSuccess, data: anonJobResponse }] =
    useAddNewPublicJobMutation()
  const isSuccess = mode === 'anonymous' ? isAnonSuccess : isAuthSuccess
  const jobResponse = mode === 'anonymous' ? anonJobResponse : authJobResponse
  const [isPerlmutterUnavailable, setIsPerlmutterUnavailable] = useState(false)
  const handleStatusCheck = (isUnavailable: boolean) => {
    setIsPerlmutterUnavailable(isUnavailable)
  }
  const [useExampleData, setUseExampleData] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Fetch configuration object
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  if (configIsLoading) return <LinearProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'

  const initialValues: NewAlphaFoldJobFormValues = {
    title: '',
    dat_file: '',
    entities: [
      {
        id: '1',
        name: 'pro-1',
        sequence: '',
        type: 'Protein',
        copies: 1,
        seq_length: 0
      }
    ]
  }

  const onSubmit = async (
    values: NewAlphaFoldJobFormValues,
    { setStatus }: { setStatus: (status: string) => void }
  ) => {
    setSubmitError(null)
    const form = new FormData()
    form.append('title', values.title)
    form.append('dat_file', values.dat_file)
    form.append('bilbomd_mode', 'alphafold')
    values.entities.forEach((entity, index) => {
      form.append(`entities[${index}][id]`, entity.id)
      form.append(`entities[${index}][name]`, entity.name)
      form.append(`entities[${index}][sequence]`, entity.sequence)
      form.append(`entities[${index}][type]`, entity.type)
      form.append(`entities[${index}][copies]`, entity.copies.toString())
    })
    if (useExampleData) {
      form.append('useExampleData', 'true')
    }

    try {
      const newJob =
        mode === 'anonymous'
          ? await addNewPublicJob(form).unwrap()
          : await addNewAlphaFoldJob(form).unwrap()
      setStatus(newJob)
    } catch (error) {
      console.error('rejected', error)
      setSubmitError(
        (error as { data?: { message?: string } }).data?.message ||
          'An error occurred during submission.'
      )
    }
  }

  const isFormValid = (values: NewAlphaFoldJobFormValues) => {
    return (
      !isPerlmutterUnavailable && values.title !== '' && values.dat_file !== ''
    )
  }

  const content = (
    <Grid
      container
      spacing={2}
    >
      <Instructions />
      <PipelineSchematic isDarkMode={isDarkMode} />
      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Typography>BilboMD AF Job Form</Typography>
        </HeaderBox>

        <Paper sx={{ p: 2 }}>
          {!useNersc ? (
            <Alert severity="warning">
              If you would like to run <b>BilboMD AF</b> which requires GPU
              compute capabilities, please head over to BilboMD running on{' '}
              <b>NERSC</b>:{' '}
              <Link
                href="https://bilbomd-nersc.bl1231.als.lbl.gov"
                target="_blank"
                rel="noopener noreferrer"
              >
                <b>bilbomd-nersc.bl1231.als.lbl.gov</b>.
              </Link>
            </Alert>
          ) : isSuccess ? (
            mode === 'anonymous' ? (
              <PublicJobSuccessAlert
                jobResponse={jobResponse}
                jobType="AF"
              />
            ) : (
              <JobSuccessAlert
                jobResponse={jobResponse}
                jobType="AF"
              />
            )
          ) : (
            <Formik<NewAlphaFoldJobFormValues>
              initialValues={initialValues}
              validationSchema={
                useExampleData ? undefined : BilboMDAlphaFoldJobSchema
              }
              onSubmit={onSubmit}
            >
              {({
                values,
                errors,
                touched,
                isValid,
                isSubmitting,
                handleChange,
                handleBlur,
                status,
                setFieldValue,
                setFieldTouched,
                validateForm
              }) => (
                <Form>
                  <Grid
                    container
                    direction="column"
                  >
                    {useNersc && (
                      <NerscStatusChecker
                        systemName="perlmutter"
                        onStatusCheck={handleStatusCheck}
                      />
                    )}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        my: 1
                      }}
                    >
                      {/* Title */}
                      <Box sx={{ minWidth: '520px' }}>
                        <Field
                          fullWidth
                          label="Title"
                          name="title"
                          id="title"
                          type="text"
                          disabled={isSubmitting}
                          as={TextField}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={errors.title && touched.title}
                          helperText={
                            errors.title && touched.title ? errors.title : ''
                          }
                          value={values.title || ''}
                        />
                      </Box>
                      <Box sx={{ ml: 8, minWidth: 'fit-content' }}>
                        <Button
                          variant={useExampleData ? 'outlined' : 'contained'}
                          onClick={() => {
                            setUseExampleData(!useExampleData)
                            if (!useExampleData) {
                              void setFieldValue(
                                'title',
                                'example-alphafold-job'
                              )
                              // Set example dat_file
                              void setFieldValue('dat_file', 'example-saxs.dat')
                              // Set example entities data
                              void setFieldValue('entities', [
                                {
                                  id: '1',
                                  name: 'pro-1',
                                  sequence: [
                                    'MGKKRTKGKTVPIDDSSETLEPVCRHIRKGLEQGNLKKALVNVEWNICQDCKTDNKVKDKAEEETEEKPSVWLCLKCGHQ',
                                    'GCGRNSQEQHALKHYLTPRSEPHCLVLSLDNWSVWCYVCDNEVQYCSSNQLGQVVDYVRKQASITTPKPAEKDNGNIELE',
                                    'NKKLEKESKNEQEREKKENMAKENPPMNSPCQITVKGLSNLGNTCFFNAVMQNLSQTPVLRELLKEVKMSGTIVKIEPPD',
                                    'LALTEPLEINLEPPGPLTLAMSQFLNEMQETKKGVVTPKELFSQVCKKAVRFKGYQQQDSQELLRYLLDGMRAEEHQRVS',
                                    'KGILKAFGNSTEKLDEELKNKVKDYEKKKSMPSFVDRIFGGELTSMIMCDQCRTVSLVHESFLDLSLPVLDDQSGKKSVN',
                                    'DKNLKKTVEDEDQDSEEEKDNDSYIKERSDIPSGTSKHLQKKAKKQAKKQAKNQRRQQKIQGKVLHLNDICTIDHPEDSE',
                                    'YEAEMSLQGEVNIKSNHISQEGVMHKEYCVNQKDLNGQAKMIESVTDNQKSTEEVDMKNINMDNDLEVLTSSPTRNLNGA',
                                    'YLTEGSNGEVDISNGFKNLNLNAALHPDEINIEILNDSHTPGTKVYEVVNEDPETAFCTLANREVFNTDECSIQHCLYQF',
                                    'TRNEKLRDANKLLCEVCTRRQCNGPKANIKGERKHVYTNAKKQMLISLAPPVLTLHLKRFQQAGFNLRKVNKHIKFPEIL',
                                    'DLAPFCTLKCKNVAEENTRVLYSLYGVVEHSGTMRSGHYTAYAKARTANSHLSNLVLHGDIPQDFEMESKGQWFHISDTH',
                                    'VQAVPTTKVLNSQAYLLFYERIL'
                                  ].join(''),
                                  type: 'Protein',
                                  copies: 1,
                                  seq_length: 823
                                }
                              ])
                            } else {
                              void setFieldValue('title', '')
                              void setFieldValue('dat_file', '')
                              // Reset to initial empty entity
                              void setFieldValue('entities', [
                                {
                                  id: '1',
                                  name: 'pro-1',
                                  sequence: '',
                                  type: 'Protein',
                                  copies: 1,
                                  seq_length: 0
                                }
                              ])
                            }
                            // Delay validation to ensure form state has been updated
                            // Force validation after state update
                            setTimeout(async () => {
                              await validateForm()
                            }, 100)
                          }}
                        >
                          {useExampleData
                            ? 'Use Custom Data'
                            : 'Load Example Data'}
                        </Button>
                      </Box>
                      <Box sx={{ ml: 2, minWidth: 'fit-content' }}>
                        <Button
                          variant="contained"
                          href={'/api/v1/public/examples/af'}
                        >
                          Download Example Data
                        </Button>
                      </Box>
                    </Box>
                    {useExampleData && (
                      <Alert
                        severity="warning"
                        sx={{ my: 1 }}
                      >
                        Using example data for Auto mode
                      </Alert>
                    )}

                    {submitError && (
                      <Alert
                        severity="error"
                        sx={{ my: 1 }}
                      >
                        {submitError}
                      </Alert>
                    )}

                    {/* Entities */}
                    <Grid sx={{ my: 2 }}>
                      <EntitiesFieldArray
                        values={values}
                        errors={errors}
                        touched={touched}
                        handleChange={handleChange}
                        handleBlur={handleBlur}
                        setFieldValue={setFieldValue}
                        useExampleData={useExampleData}
                      />

                      {/* Conditionally display error messages for alphafold_entities */}
                      {Array.isArray(errors.entities) &&
                      Array.isArray(touched.entities)
                        ? (errors.entities as FormikErrors<Entity>[]).map(
                            (error, idx) =>
                              error && (
                                <Box
                                  key={idx}
                                  sx={{ my: 2 }}
                                >
                                  {error.sequence && (
                                    <Alert severity="error">{`Entity ${
                                      idx + 1
                                    } sequence: ${error.sequence}`}</Alert>
                                  )}
                                  {error.type && (
                                    <Alert severity="error">{`Entity ${
                                      idx + 1
                                    } type: ${error.type}`}</Alert>
                                  )}
                                  {error.copies && (
                                    <Alert severity="error">{`Entity ${
                                      idx + 1
                                    } copies: ${error.copies}`}</Alert>
                                  )}
                                </Box>
                              )
                          )
                        : null}
                    </Grid>

                    {/* SAXS dat file */}
                    <Grid>
                      <Field
                        name="dat_file"
                        id="dat-file-upload"
                        as={FileSelect}
                        title="Select File"
                        disabled={isSubmitting || useExampleData}
                        setFieldValue={setFieldValue}
                        setFieldTouched={setFieldTouched}
                        error={errors.dat_file && touched.dat_file}
                        errorMessage={errors.dat_file ? errors.dat_file : ''}
                        fileType="experimental SAXS data *.dat"
                        fileExt=".dat"
                        existingFileName={
                          useExampleData ? 'example-saxs.dat' : undefined
                        }
                      />
                    </Grid>

                    {/* Progress Bar */}
                    {isSubmitting && (
                      <Box sx={{ my: 1, width: '520px' }}>
                        <LinearProgress />
                      </Box>
                    )}

                    {/* Submit Button */}
                    <SubmitButton
                      isSubmitting={isSubmitting}
                      isValid={useExampleData ? true : isValid}
                      isFormValid={isFormValid(values)}
                      status={status}
                    />
                  </Grid>
                  {import.meta.env.MODE === 'development' ? <Debug /> : ''}
                </Form>
              )}
            </Formik>
          )}
        </Paper>
      </Grid>
    </Grid>
  )

  return content
}

export default NewAlphaFoldJob
