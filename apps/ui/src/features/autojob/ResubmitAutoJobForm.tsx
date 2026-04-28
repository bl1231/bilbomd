import { useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  AlertTitle,
  Paper
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { Link as RouterLink, useParams, useNavigate } from 'react-router'
import { Form, Formik, Field } from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import {
  useAddNewAutoJobMutation,
  useGetJobByIdQuery,
  useCheckJobFilesQuery
} from '../../slices/jobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import AutoJobFormInstructions from './AutoJobFormInstructions'
import { BilboMDAutoJobSchema } from 'schemas/BilboMDAutoJobSchema'
import { detectStrippableCofactors } from 'schemas/ValidationFunctions'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import useTitle from 'hooks/useTitle'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import { useTheme } from '@mui/material/styles'
import PipelineSchematic from './PipelineSchematic'
import { BilboMDAutoJobFormValues } from '../../types/autoJobForm'
import type { BilboMDAutoDTO } from '@bilbomd/bilbomd-types'
import MdEngineField from 'components/MdEngineField'

const ResubmitAutoJobForm = () => {
  useTitle('BilboMD: Resubmit Auto Job')

  // Theme and routing
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'
  const { id } = useParams()
  const navigate = useNavigate()

  // State, RTK mutations and queries
  const [addNewAutoJob, { isSuccess }] = useAddNewAutoJobMutation()
  const [isPerlmutterUnavailable, setIsPerlmutterUnavailable] = useState(false)
  const handleStatusCheck = (isUnavailable: boolean) => {
    setIsPerlmutterUnavailable(isUnavailable)
  }
  const [mdEngine, setMdEngine] = useState<'charmm' | 'openmm'>('charmm')
  const [pdbWarning, setPdbWarning] = useState<string>('')

  // RTK Query to fetch the configuration
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  // RTK Query to fetch the job data
  const {
    data: jobdata,
    isLoading: jobIsLoading,
    isError: jobIsError
  } = useGetJobByIdQuery(id!, {
    skip: !id
  })

  // RTK Query to check if the files are still on disk and available for reuse
  const fileCheckQuery = useCheckJobFilesQuery(jobdata?.mongo.id ?? '', {
    skip: !jobdata?.mongo.id
  })

  // Are we running on NERSC?
  const useNersc = config?.useNersc?.toLowerCase() === 'true'
  const charmmEnabled = config?.enableCharmmEngine?.toLowerCase() !== 'false'

  // Grouped early return for loading and error states
  {
    // Loading states
    if (
      configIsLoading ||
      jobIsLoading ||
      !jobdata ||
      !config ||
      !fileCheckQuery ||
      !fileCheckQuery.data
    ) {
      return <LinearProgress />
    }
    // Error states
    if (configError)
      return <Alert severity="error">Error loading configuration</Alert>

    if (jobIsError)
      return <Alert severity="error">Error retrieving parent job info</Alert>
    if (fileCheckQuery.error) {
      const fileCheckError = fileCheckQuery.error
      return (
        <Alert severity="error">
          Error checking job files:{' '}
          {'message' in fileCheckError
            ? fileCheckError.message
            : 'Unknown error'}
        </Alert>
      )
    }
  }

  const job = jobdata
  const fileCheckData = fileCheckQuery.data

  let jobMongo: BilboMDAutoDTO
  if (job.mongo.jobType === 'auto') {
    jobMongo = job.mongo as BilboMDAutoDTO
  } else {
    throw new Error(`Unsupported job type: ${job.mongo.jobType}`)
  }

  const initialValues: BilboMDAutoJobFormValues = {
    bilbomd_mode: 'auto',
    title: 'resubmit-' + jobMongo.title,
    pdb_file: jobMongo.pdb_file ?? '',
    pae_file: jobMongo.pae_file ?? '',
    dat_file: jobMongo.data_file ?? '',
    md_engine: !charmmEnabled
      ? 'openmm'
      : ((jobMongo.md_engine?.toLowerCase?.() as 'charmm' | 'openmm') ??
        'charmm')
  }

  const onSubmit = async (values: BilboMDAutoJobFormValues) => {
    const form = new FormData()
    form.append('bilbomd_mode', values.bilbomd_mode)
    form.append('title', values.title)
    form.append('md_engine', values.md_engine)

    form.append('resubmit', 'true')
    if (job?.mongo.id) {
      form.append('original_job_id', job.mongo.id)
    }

    if (values.pdb_file instanceof File) {
      form.append('pdb_file', values.pdb_file)
    } else if (fileCheckData?.pdb_file) {
      form.append('reuse_pdb_file', 'true')
    }

    if (values.dat_file instanceof File) {
      form.append('dat_file', values.dat_file)
    } else if (fileCheckData?.dat_file) {
      form.append('reuse_dat_file', 'true')
    }

    if (values.pae_file instanceof File) {
      form.append('pae_file', values.pae_file)
    } else if (fileCheckData?.pae_file) {
      form.append('reuse_pae_file', 'true')
    }

    try {
      const newJob = await addNewAutoJob(form).unwrap()
      // Navigate to the new job page
      void navigate(`/dashboard/jobs/${newJob.id}`)
    } catch (error) {
      console.error('rejected', error)
    }
  }

  const isFormValid = (
    values: BilboMDAutoJobFormValues,
    reuseFlags: typeof fileCheckData
  ) => {
    const hasPDB = values.pdb_file instanceof File || reuseFlags?.pdb_file
    const hasDAT = values.dat_file instanceof File || reuseFlags?.dat_file
    const hasPAE = values.pae_file instanceof File || reuseFlags?.pae_file
    const hasTitle = values.title.trim() !== ''
    return !isPerlmutterUnavailable && hasPDB && hasDAT && hasPAE && hasTitle
  }

  const content = (
    <Grid
      container
      spacing={2}
    >
      <Grid size={{ xs: 12 }}>
        <AutoJobFormInstructions />
      </Grid>

      <PipelineSchematic
        isDarkMode={isDarkMode}
        mdEngine={mdEngine}
      />

      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Typography>BilboMD Auto Job Form</Typography>
        </HeaderBox>
        <Paper sx={{ p: 2 }}>
          {isSuccess ? (
            <Alert severity="success">
              <AlertTitle>Woot!</AlertTitle>
              <Typography>
                Your job has been submitted. Check out the{' '}
                <RouterLink to="../jobs">details</RouterLink>.
              </Typography>
            </Alert>
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
                status,
                setFieldValue,
                setFieldTouched
              }) => (
                <Form>
                  <Grid
                    container
                    sx={{ flexDirection: 'column' }}
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

                    {/* MD Engine selection */}
                    <Grid sx={{ width: '520px', mb: 1 }}>
                      <MdEngineField
                        value={values.md_engine as 'charmm' | 'openmm'}
                        onChange={(val) => {
                          void setFieldValue('md_engine', val)
                          setMdEngine(val)
                          if (val === 'charmm') {
                            setPdbWarning('')
                          } else if (
                            val === 'openmm' &&
                            values.pdb_file instanceof File
                          ) {
                            void detectStrippableCofactors(
                              values.pdb_file
                            ).then((found) => {
                              setPdbWarning(
                                found.length > 0
                                  ? `The following residues have no Amber force-field parameters and will be removed before MD: ${found.join(', ')}`
                                  : ''
                              )
                            })
                          }
                        }}
                        disabled={isSubmitting}
                        disableCharmm={!charmmEnabled}
                      />
                    </Grid>

                    <Grid>
                      <Field
                        name="pdb_file"
                        id="pdb-file-upload"
                        as={FileSelect}
                        title="Select File"
                        existingFileName={
                          fileCheckData?.pdb_file
                            ? jobMongo.pdb_file
                            : undefined
                        }
                        disabled={isSubmitting}
                        setFieldValue={setFieldValue}
                        setFieldTouched={setFieldTouched}
                        error={errors.pdb_file && touched.pdb_file}
                        errorMessage={errors.pdb_file ? errors.pdb_file : ''}
                        warningMessage={pdbWarning}
                        fileType="AlphaFold2 *.pdb"
                        fileExt=".pdb"
                        onFileChange={async (file: File) => {
                          if (mdEngine !== 'openmm') {
                            setPdbWarning('')
                            return
                          }
                          const found = await detectStrippableCofactors(file)
                          setPdbWarning(
                            found.length > 0
                              ? `The following residues have no Amber force-field parameters and will be removed before MD: ${found.join(', ')}`
                              : ''
                          )
                        }}
                      />
                    </Grid>

                    <Grid>
                      <Field
                        name="pae_file"
                        id="pae-file-upload"
                        as={FileSelect}
                        title="Select File"
                        existingFileName={
                          fileCheckData?.pae_file
                            ? jobMongo.pae_file
                            : undefined
                        }
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
                        existingFileName={
                          fileCheckData?.dat_file
                            ? jobMongo.data_file
                            : undefined
                        }
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
                          !isValid ||
                          isSubmitting ||
                          !isFormValid(values, fileCheckData)
                        }
                        loading={isSubmitting}
                        endIcon={<SendIcon />}
                        loadingPosition="end"
                        variant="contained"
                        sx={{ width: '110px' }}
                      >
                        <span>Submit</span>
                      </Button>

                      {isSuccess ? (
                        <Alert severity="success">{status}</Alert>
                      ) : (
                        ''
                      )}
                    </Grid>
                  </Grid>
                  {process.env.NODE_ENV === 'development' ? <Debug /> : ''}
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

export default ResubmitAutoJobForm
