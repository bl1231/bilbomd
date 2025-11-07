import { useState } from 'react'
import { Box, Button, TextField, Typography, Alert, Paper } from '@mui/material'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field } from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import { useAddNewAutoJobMutation } from '../../slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import NewAutoJobFormInstructions from './AutoJobFormInstructions'
import { BilboMDAutoJobSchema } from 'schemas/BilboMDAutoJobSchema'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import useTitle from 'hooks/useTitle'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import { useTheme } from '@mui/material/styles'
import PipelineSchematic from './PipelineSchematic'
import { BilboMDAutoJobFormValues } from '../../types/autoJobForm'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'

type NewJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

const NewAutoJobForm = ({ mode = 'authenticated' }: NewJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New Auto Job (anon)'
      : 'BilboMD: New Auto Job'
  )

  // Theme and routing
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'

  // State, RTK mutations and queries
  const [addNewJob, { isSuccess: isAuthSuccess, data: authJobResponse }] =
    useAddNewAutoJobMutation()
  const [addNewPublicJob, { isSuccess: isAnonSuccess, data: anonJobResponse }] =
    useAddNewPublicJobMutation()
  const isSuccess = mode === 'anonymous' ? isAnonSuccess : isAuthSuccess
  const jobResponse = mode === 'anonymous' ? anonJobResponse : authJobResponse
  const [isPerlmutterUnavailable, setIsPerlmutterUnavailable] = useState(false)
  const handleStatusCheck = (isUnavailable: boolean) => {
    setIsPerlmutterUnavailable(isUnavailable)
  }

  // RTK Query to fetch the configuration
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  if (configIsLoading) return <LinearProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration</Alert>

  // Are we running on NERSC?
  const useNersc = config.useNersc?.toLowerCase() === 'true'

  const initialValues: BilboMDAutoJobFormValues = {
    bilbomd_mode: 'auto',
    title: '',
    pdb_file: '',
    pae_file: '',
    dat_file: ''
  }

  const onSubmit = async (
    values: BilboMDAutoJobFormValues,
    { setStatus }: { setStatus: (status: string) => void }
  ) => {
    const form = new FormData()
    form.append('title', values.title)
    form.append('pdb_file', values.pdb_file)
    form.append('dat_file', values.dat_file)
    form.append('pae_file', values.pae_file)
    form.append('bilbomd_mode', 'auto')

    try {
      const newJob =
        mode === 'anonymous'
          ? await addNewPublicJob(form).unwrap()
          : await addNewJob(form).unwrap()
      setStatus(newJob)
    } catch (error) {
      console.error('rejected', error)
    }
  }

  const isFormValid = (values: BilboMDAutoJobFormValues) => {
    return (
      !isPerlmutterUnavailable &&
      values.title !== '' &&
      values.pdb_file !== '' &&
      values.pae_file !== '' &&
      values.dat_file !== ''
    )
  }

  const content = (
    <>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 12 }}>
          <NewAutoJobFormInstructions />
        </Grid>

        <PipelineSchematic isDarkMode={isDarkMode} />

        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>BilboMD Auto Job Form</Typography>
          </HeaderBox>

          <Paper sx={{ p: 2 }}>
            {isSuccess ? (
              mode === 'anonymous' ? (
                <PublicJobSuccessAlert
                  jobResponse={jobResponse}
                  jobType="Auto"
                />
              ) : (
                <JobSuccessAlert
                  jobResponse={jobResponse}
                  jobType="Auto"
                />
              )
            ) : (
              <Formik
                initialValues={initialValues}
                validationSchema={BilboMDAutoJobSchema}
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
                  setFieldTouched
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
                      <Grid sx={{ my: 2, width: '520px' }}>
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
                      </Grid>

                      <Grid>
                        <Field
                          name="pdb_file"
                          id="pdb-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          error={errors.pdb_file && touched.pdb_file}
                          errorMessage={errors.pdb_file ? errors.pdb_file : ''}
                          fileType="AlphaFold2 *.pdb"
                          fileExt=".pdb"
                        />
                      </Grid>

                      <Grid>
                        <Field
                          name="pae_file"
                          id="pae-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          error={errors.pae_file && touched.pae_file}
                          errorMessage={errors.pae_file ? errors.pae_file : ''}
                          fileType="AlphaFold2 PAE *.json"
                          fileExt=".json"
                        />
                      </Grid>
                      <Grid>
                        <Field
                          name="dat_file"
                          id="dat-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          error={errors.dat_file && touched.dat_file}
                          errorMessage={errors.dat_file ? errors.dat_file : ''}
                          fileType="experimental SAXS data *.dat"
                          fileExt=".dat"
                        />
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
                            !isValid || isSubmitting || !isFormValid(values)
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

export default NewAutoJobForm
