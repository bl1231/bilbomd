import { ReactNode, useState } from 'react'
import {
  Box,
  Button,
  Typography,
  Alert,
  AlertTitle,
  Paper
} from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'
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
import {
  detectGaffCofactors,
  detectMetalCofactors,
  isPlddtColumnAllZero
} from 'schemas/ValidationFunctions'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import TitleField from 'components/TitleField'
import useTitle from 'hooks/useTitle'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import { useTheme } from '@mui/material/styles'
import PipelineSchematic from './PipelineSchematic'
import { BilboMDAutoJobFormValues } from '../../types/autoJobForm'
import type { BilboMDAutoDTO } from '@bilbomd/bilbomd-types'
import { logger } from 'utils/logger'

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
  const [mdEngine] = useState<'charmm' | 'openmm'>('openmm')
  const [pdbWarning, setPdbWarning] = useState<ReactNode>('')
  const [pdbInfo, setPdbInfo] = useState<string>('')

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
    md_engine: 'openmm'
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
      logger.error('rejected', error)
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
                    <Grid sx={{ my: 2, width: '100%', maxWidth: '520px' }}>
                      <TitleField />
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
                        infoMessage={pdbInfo}
                        warningMessage={pdbWarning}
                        fileType="AlphaFold2 *.pdb"
                        fileExt=".pdb"
                        onFileChange={async (file: File) => {
                          const [gaffFound, metalFound, plddtAllZero] =
                            await Promise.all([
                              detectGaffCofactors(file),
                              detectMetalCofactors(file),
                              isPlddtColumnAllZero(file)
                            ])
                          setPdbInfo(
                            gaffFound.length > 0
                              ? `The following molecules will be automatically parameterized using GAFF2 for OpenMM: ${gaffFound.join(', ')}`
                              : ''
                          )
                          const metalWarning =
                            metalFound.length > 0 ? (
                              <Box>
                                The following metal-containing
                                residues have no force-field
                                parameters and will be removed before
                                MD: {metalFound.join(', ')}. If these
                                residues are important for your
                                system, consider using{' '}
                                <Button
                                  href="https://charmm-gui.org/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  size="small"
                                  variant="outlined"
                                  color="info"
                                  endIcon={<LaunchIcon />}
                                  sx={{
                                    textTransform: 'none',
                                    py: 0,
                                    px: 0.75,
                                    minHeight: 0,
                                    fontSize: 'inherit',
                                    lineHeight: 'inherit',
                                    verticalAlign: 'baseline'
                                  }}
                                >
                                  CHARMM-GUI
                                </Button>{' '}
                                to properly parameterize your
                                structure, then submit a Classic job
                                with CRD and PSF files using the
                                CHARMM engine option.
                              </Box>
                            ) : null
                          const plddtWarning = plddtAllZero ? (
                            <Box>
                              All B-factor (pLDDT) values in this
                              structure are zero. If your PAE JSON is
                              AlphaFold3-style (contains per-atom
                              pLDDT), BilboMD will recover pLDDT
                              automatically; otherwise no rigid bodies
                              will be defined and your model will not be
                              flexed. Consider re-uploading a structure
                              that retains pLDDT in the B-factor column.
                            </Box>
                          ) : null
                          setPdbWarning(
                            metalWarning || plddtWarning ? (
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 1
                                }}
                              >
                                {metalWarning}
                                {plddtWarning}
                              </Box>
                            ) : (
                              ''
                            )
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
                      <Box sx={{ my: 1, width: '100%', maxWidth: '520px' }}>
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
