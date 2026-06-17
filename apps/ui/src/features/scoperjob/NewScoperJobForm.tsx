import { useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Link,
  Checkbox,
  FormControlLabel
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field, FormikHelpers } from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import { useAddNewScoperJobMutation } from 'slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { bilbomdScoperJobSchema } from 'schemas/ScoperValidationSchema'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import useTitle from 'hooks/useTitle'
import useLicenseValid from 'hooks/useLicenseValid'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'
import { logger } from 'utils/logger'

type NewScoperJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

const NewScoperJobForm = ({
  mode = 'authenticated'
}: NewScoperJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New Scoper Job (anon)'
      : 'BilboMD: New Scoper Job'
  )

  const [addNewScoperJob, { isSuccess: isAuthSuccess, data: authJobResponse }] =
    useAddNewScoperJobMutation()
  const [addNewPublicJob, { isSuccess: isAnonSuccess, data: anonJobResponse }] =
    useAddNewPublicJobMutation()
  const isSuccess = mode === 'anonymous' ? isAnonSuccess : isAuthSuccess

  // Transform responses to expected shape
  const publicJobResponse =
    anonJobResponse && mode === 'anonymous'
      ? {
          resultUrl: anonJobResponse.resultUrl,
          publicId: anonJobResponse.publicId
        }
      : undefined

  const authSuccessResponse =
    authJobResponse && mode === 'authenticated'
      ? {
          message: authJobResponse.message || 'Job submitted successfully',
          jobid: authJobResponse.jobid,
          uuid: authJobResponse.uuid
        }
      : undefined

  const [useExampleData, setUseExampleData] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const licenseValid = useLicenseValid()

  const initialValues = {
    title: '',
    pdb_file: '',
    dat_file: '',
    fixc1c2: false
  }

  interface ScoperJobFormValues {
    title: string
    pdb_file: string
    dat_file: string
    fixc1c2: boolean
  }

  const onSubmit = async (
    values: ScoperJobFormValues,
    { setStatus }: FormikHelpers<ScoperJobFormValues>
  ) => {
    setSubmitError(null)
    const form = new FormData()
    form.append('title', values.title)
    form.append('pdb_file', values.pdb_file)
    form.append('dat_file', values.dat_file)
    form.append('fixc1c2', values.fixc1c2.toString())
    form.append('bilbomd_mode', 'scoper')
    if (useExampleData) {
      form.append('useExampleData', 'true')
    }

    try {
      // const newJob = await addNewScoperJob(form).unwrap()
      const newJob =
        mode === 'anonymous'
          ? await addNewPublicJob(form).unwrap()
          : await addNewScoperJob(form).unwrap()
      setStatus(newJob)
    } catch (error) {
      logger.error('rejected', error)
      setSubmitError(
        (error as { data?: { message?: string } }).data?.message ||
          'An error occurred during submission.'
      )
    }
  }

  const content = (
    <>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 12 }}>
          <Accordion>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
              sx={{
                backgroundColor: '#888',
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                pl: 1
              }}
            >
              <Typography
                sx={{
                  textTransform: 'uppercase',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  color: '#fff',
                  letterSpacing: '1px'
                }}
              >
                Instructions
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography sx={{ m: 1 }}>
                Scoper is a novel data analysis pipeline that uses a combination
                of classical algorithms and deep-learning techniques to find
                structures, along with magnesium ion binding sites that fit a
                given SAXS profile, given an initial structure to work with.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <img
                  src="/scoper/scoper_full_pipeline.png"
                  alt="Overview of Scoper pipeline"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </Box>
              <Typography sx={{ m: 1 }}>
                A novel deep neural network was created for this pipeline which
                we named IonNet. IonNet is used to predict magnesium binding
                sites for RNA structures. The input for our model is a PDB file
                of the RNA structure.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <img
                  src="/scoper/MGClassifier_Architecture.drawio.png"
                  alt="Overview of Scoper pipeline"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </Box>
              <Typography>
                Scoper was created by Edan Patt, Dina Schneidman, and Michal
                Hammel. The web implementation was done by Scott Classen. The
                source code and trained model for the backend Scoper/IonNet
                analysis steps comes from the{' '}
                <Link
                  href="https://github.com/dina-lab3D/IonNet"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IonNet
                </Link>{' '}
                repository.{' '}
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>Scoper Job Form</Typography>
          </HeaderBox>

          <Paper sx={{ p: 2 }}>
            {isSuccess ? (
              mode === 'anonymous' && publicJobResponse ? (
                <PublicJobSuccessAlert
                  jobResponse={publicJobResponse}
                  jobType="Auto"
                />
              ) : authSuccessResponse ? (
                <JobSuccessAlert
                  jobResponse={authSuccessResponse}
                  jobType="Auto"
                />
              ) : null
            ) : (
              <Formik
                initialValues={initialValues}
                validationSchema={
                  useExampleData ? undefined : bilbomdScoperJobSchema
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
                          my: 1
                        }}
                      >
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
                                // Switching to example data: reset file fields
                                void setFieldValue(
                                  'title',
                                  'example-scoper-job'
                                )
                                void setFieldValue('pdb_file', '')
                                void setFieldValue('dat_file', '')
                                void setFieldValue('fixc1c2', true)
                              } else {
                                // Switching to custom data: clear example defaults
                                void setFieldValue('title', '')
                                void setFieldValue('pdb_file', '')
                                void setFieldValue('dat_file', '')
                                void setFieldValue('fixc1c2', false)
                              }
                              // Delay validation to ensure form state has been updated
                              setTimeout(() => {
                                void validateForm()
                              }, 0)
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
                            href={'/api/v1/public/examples/scoper'}
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

                      <Grid>
                        <Field
                          name="pdb_file"
                          id="pdb-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting || useExampleData}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          error={errors.pdb_file && touched.pdb_file}
                          errorMessage={errors.pdb_file ? errors.pdb_file : ''}
                          fileType="RNA *.pdb"
                          fileExt=".pdb"
                          existingFileName={
                            useExampleData ? 'example-rna.pdb' : undefined
                          }
                        />
                      </Grid>

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
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', mt: 2 }}
                        >
                          <Field name="fixc1c2">
                            {({
                              field
                            }: {
                              field: {
                                name: string
                                value: boolean
                                onChange: (
                                  e: React.ChangeEvent<HTMLInputElement>
                                ) => void
                              }
                            }) => (
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={field.value}
                                    onChange={field.onChange}
                                    name={field.name}
                                    disabled={isSubmitting || useExampleData}
                                    slotProps={{
                                      input: {
                                        'aria-label': 'fix-c1c2-checkbox'
                                      }
                                    }}
                                  />
                                }
                                label={
                                  useExampleData
                                    ? 'Fix c1/c2 values at 1.00 (example default)'
                                    : 'Fix c1/c2 values at 1.00'
                                }
                              />
                            )}
                          </Field>
                        </Box>
                      </Grid>

                      <Grid sx={{ my: 2, width: '520px' }}>
                        <Alert
                          severity="info"
                          sx={{
                            fontSize: '1rem', // Adjust font size
                            lineHeight: '1.4' // Adjust line spacing
                          }}
                        >
                          SAXS profiles are calculated using the <b>FoXS</b>{' '}
                          calculator and fit to the experimental data by
                          adjusting the excluded volume (<b>c1</b>) and
                          hydration layer (<b>c2</b>) parameters (
                          <Link
                            href="https://doi.org/10.1016/j.bpj.2013.07.020"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <b>details</b>
                          </Link>
                          ). The default is to let <b>FoXS</b> refine the{' '}
                          <b>c2</b> values. However, this can result in some Mg
                          <sup>++</sup> ions being &quot;absorbed&quot; into the
                          solvent contribution. To increase the likelihood of{' '}
                          <b>Scoper</b> placing Mg<sup>++</sup> ions in the RNA
                          structure, you can fix the <b>c1</b> and <b>c2</b>{' '}
                          values at <b>1.00</b>.
                        </Alert>
                      </Grid>

                      {isSubmitting && (
                        <Box sx={{ my: 1, width: '520px' }}>
                          <LinearProgress />
                        </Box>
                      )}

                      <Grid sx={{ mt: 2 }}>
                        <Button
                          type="submit"
                          disabled={
                            (!isValid && !useExampleData) ||
                            values.title === '' ||
                            (!useExampleData &&
                              (values.pdb_file === '' ||
                                values.dat_file === '')) ||
                            !licenseValid
                          }
                          loading={isSubmitting}
                          endIcon={<SendIcon />}
                          loadingPosition="end"
                          variant="contained"
                          sx={{ width: '110px' }}
                        >
                          <span>Submit</span>
                        </Button>
                      </Grid>
                    </Grid>
                    {import.meta.env.MODE === 'development' ? <Debug /> : ''}
                  </Form>
                )}
              </Formik>
            )}
          </Paper>
        </Grid>
      </Grid>
    </>
  )

  return content
}

export default NewScoperJobForm
