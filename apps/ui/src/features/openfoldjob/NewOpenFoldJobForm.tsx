import { useState } from 'react'
import { Box, Typography, Alert, Paper, Button, Link } from '@mui/material'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field, FormikErrors } from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import SaxsDataOptions from 'features/jobs/SaxsDataOptions'
import { useAddNewOpenFoldJobMutation } from 'slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import { BilboMDOpenFoldJobSchema } from 'schemas/BilboMDOpenFoldJobSchema'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import TitleField from 'components/TitleField'
import useTitle from 'hooks/useTitle'
import { OpenFoldEntity, NewOpenFoldJobFormValues } from 'types/openfoldForm'
import NewOpenFoldJobFormInstructions from './NewOpenFoldJobFormInstructions'
import EntitiesFieldArray from 'features/shared/entities/EntitiesFieldArray'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'
import OF3OpenMMPipelineSchematic from './OF3OpenMMPipelineSchematic'
import { logger } from 'utils/logger'
import { getSubmitError, type SubmitError } from 'utils/submitError'
import SubmitErrorAlert from 'components/SubmitErrorAlert'

type NewJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

const Instructions = () => (
  <Grid size={{ xs: 12 }}>
    <NewOpenFoldJobFormInstructions />
  </Grid>
)

const PipelineSchematic = () => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox>
      <Typography>BilboMD OF3 Schematic</Typography>
    </HeaderBox>
    <Paper sx={{ p: 2 }}>
      <OF3OpenMMPipelineSchematic />
    </Paper>
  </Grid>
)

const SubmitButton = ({
  isSubmitting,
  isValid,
  isFormValid,
  status: _status
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
  </Grid>
)

const NewOpenFoldJob = ({ mode = 'authenticated' }: NewJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New OpenFold3 Job (anonymous)'
      : 'BilboMD: New OpenFold3 Job'
  )
  const [
    addNewOpenFoldJob,
    { isSuccess: isAuthSuccess, data: authJobResponse }
  ] = useAddNewOpenFoldJobMutation()
  const [addNewPublicJob, { isSuccess: isAnonSuccess, data: anonJobResponse }] =
    useAddNewPublicJobMutation()
  const isSuccess = mode === 'anonymous' ? isAnonSuccess : isAuthSuccess

  const publicJobResponse =
    anonJobResponse && mode === 'anonymous'
      ? {
          resultUrl: anonJobResponse.resultUrl,
          publicId: anonJobResponse.publicId,
          md_engine: anonJobResponse.md_engine
        }
      : undefined

  const authSuccessResponse =
    authJobResponse && mode === 'authenticated'
      ? {
          message: authJobResponse.message || 'Job submitted successfully',
          jobid: authJobResponse.jobid,
          uuid: authJobResponse.uuid,
          md_engine: authJobResponse.md_engine
        }
      : undefined

  const [useExampleData, setUseExampleData] = useState(false)
  const [submitError, setSubmitError] = useState<SubmitError | null>(null)

  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  if (configIsLoading) return <LinearProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration</Alert>
  if (!config)
    return <Alert severity="error">Configuration not available</Alert>

  const useOpenFold = config.enableBilboMdOpenfold?.toLowerCase() === 'true'

  const initialValues: NewOpenFoldJobFormValues = {
    title: '',
    dat_file: '',
    q_units: 'auto',
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

  const onSubmit = async (values: NewOpenFoldJobFormValues) => {
    setSubmitError(null)
    const form = new FormData()
    form.append('title', values.title)
    form.append('dat_file', values.dat_file)
    form.append('q_units', values.q_units)
    form.append('bilbomd_mode', 'openfold')
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
      await (mode === 'anonymous'
        ? addNewPublicJob(form).unwrap()
        : addNewOpenFoldJob(form).unwrap())
    } catch (error) {
      logger.error('rejected', error)
      setSubmitError(getSubmitError(error))
    }
  }

  const isFormValid = (values: NewOpenFoldJobFormValues) =>
    values.title !== '' && values.dat_file !== ''

  const content = (
    <Grid
      container
      spacing={2}
    >
      <Instructions />
      <PipelineSchematic />
      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography>BilboMD OF3 Job Form</Typography>
            <Typography
              component="span"
              sx={{ color: 'yellow', ml: 1 }}
            >
              *Experimental - Please report problems to Scott
            </Typography>
          </Box>
        </HeaderBox>

        <Paper sx={{ p: 2 }}>
          {!useOpenFold ? (
            <Alert severity="warning">
              <b>BilboMD OF3</b> is not currently enabled on this deployment.
              Please contact the{' '}
              <Link
                href="mailto:support@bl1231.als.lbl.gov"
                target="_blank"
                rel="noopener noreferrer"
              >
                BilboMD team
              </Link>{' '}
              if you need access to the OpenFold3 pipeline.
            </Alert>
          ) : isSuccess ? (
            mode === 'anonymous' && publicJobResponse ? (
              <PublicJobSuccessAlert
                jobResponse={publicJobResponse}
                jobType="OF3"
              />
            ) : authSuccessResponse ? (
              <JobSuccessAlert
                jobResponse={authSuccessResponse}
                jobType="OF3"
              />
            ) : null
          ) : (
            <>
              <Formik<NewOpenFoldJobFormValues>
                initialValues={initialValues}
                validationSchema={
                  useExampleData ? undefined : BilboMDOpenFoldJobSchema
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
                      sx={{ flexDirection: 'column' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          rowGap: 1,
                          my: 1
                        }}
                      >
                        {/* Title */}
                        <Box
                          sx={{
                            minWidth: { xs: 0, md: '520px' },
                            width: '100%',
                            maxWidth: '520px'
                          }}
                        >
                          <TitleField />
                        </Box>
                        <Box
                          sx={{ ml: { xs: 0, md: 8 }, minWidth: 'fit-content' }}
                        >
                          <Button
                            variant={useExampleData ? 'outlined' : 'contained'}
                            onClick={() => {
                              setUseExampleData(!useExampleData)
                              if (!useExampleData) {
                                void setFieldValue(
                                  'title',
                                  'example-openfold-job'
                                )
                                void setFieldValue(
                                  'dat_file',
                                  'example-saxs.dat'
                                )
                                void setFieldValue('entities', [
                                  {
                                    id: '1',
                                    name: 'pro-1',
                                    sequence:
                                      'MGSSHHHHHHSSGLVPRGSHMSGKIQHKAVVPAPSRIPLTLSEIEDLRRKGFNQTEIAELYGVTRQAVSWHKKTYGGRLTTRQIVQQNWPWDTRKPHDKSKAFQRLRDHGEYMRVGSFRTMSEDKKKRLLSWWKMLRDNDLVLEFDPSIEPYEGMAGGGFRYVPRDISDDDLLIRVNEHTQLTAEGELLWSWPDDIEELLSEP',
                                    type: 'Protein',
                                    copies: 1,
                                    seq_length: 203
                                  },
                                  {
                                    id: '2',
                                    name: 'dna-2',
                                    sequence: 'TGTTTCGGTGGCTGTCAAGCGGGC',
                                    type: 'DNA',
                                    copies: 1,
                                    seq_length: 24
                                  },
                                  {
                                    id: '3',
                                    name: 'dna-3',
                                    sequence: 'GCCCGCTTGACAGCCACCGAAACA',
                                    type: 'DNA',
                                    copies: 1,
                                    seq_length: 24
                                  }
                                ])
                              } else {
                                void setFieldValue('title', '')
                                void setFieldValue('dat_file', '')
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
                        <Box
                          sx={{ ml: { xs: 1, md: 2 }, minWidth: 'fit-content' }}
                        >
                          <Button
                            variant="contained"
                            href={'/api/v1/public/examples/of3'}
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
                          Using example data for OpenFold3 mode
                        </Alert>
                      )}

                      <SubmitErrorAlert
                        error={submitError}
                        sx={{ my: 1 }}
                      />

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

                        {Array.isArray(errors.entities) &&
                        Array.isArray(touched.entities)
                          ? (
                              errors.entities as FormikErrors<OpenFoldEntity>[]
                            ).map(
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
                      <Grid>
                        <SaxsDataOptions
                          disabled={isSubmitting || useExampleData}
                        />
                      </Grid>

                      {/* Progress Bar */}
                      {isSubmitting && (
                        <Box sx={{ my: 1, width: '100%', maxWidth: '520px' }}>
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
            </>
          )}
        </Paper>
      </Grid>
    </Grid>
  )

  return content
}

export default NewOpenFoldJob
