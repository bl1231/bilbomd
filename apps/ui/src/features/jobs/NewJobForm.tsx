import { ReactNode, useState } from 'react'
import { logger } from 'utils/logger'
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Alert,
  Paper,
  LinearProgress
} from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field } from 'formik'
import {
  useAddNewJobMutation,
  useCalculateAutoRgMutation
} from 'slices/jobsApiSlice'
import { useAddNewPublicJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import { expdataSchema } from 'schemas/ExpdataSchema'
import { BilboMDClassicJobSchema } from 'schemas/BilboMDClassicJobSchema'
import {
  detectGaffCofactors,
  detectMetalCofactors
} from 'schemas/ValidationFunctions'
import SAXSGuinierPlot from './SAXSGuinierPlot'
import HeaderBox from 'components/HeaderBox'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import FileSelect from './FileSelect'
import useTitle from 'hooks/useTitle'
import { Debug } from 'components/Debug'
import NewJobFormInstructions from './NewJobFormInstructions'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import { useTheme } from '@mui/material/styles'
import PipelineSchematic from './PipelineSchematic'
import { BilboMDClassicJobFormValues } from '../../types/classicJobForm'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from './JobSuccessAlert'
import MdEngineField from 'components/MdEngineField'
import { getRgMaxWarning } from './rgMaxWarning'

type NewJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

const NewJobForm = ({ mode = 'authenticated' }: NewJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New Classic Job (anonymous)'
      : 'BilboMD: New Classic Job'
  )

  // theme and dark mode detection
  const theme = useTheme()
  const isDarkMode = theme.palette.mode === 'dark'

  // State, RTK mutations and queries
  const [addNewJob, { isSuccess: isAuthSuccess, data: authJobResponse }] =
    useAddNewJobMutation()
  const [addNewPublicJob, { isSuccess: isAnonSuccess, data: anonJobResponse }] =
    useAddNewPublicJobMutation()
  const [calculateAutoRg, { isLoading }] = useCalculateAutoRgMutation()
  const isSuccess = mode === 'anonymous' ? isAnonSuccess : isAuthSuccess

  // Transform responses to expected shape
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

  const [isPerlmutterUnavailable, setIsPerlmutterUnavailable] = useState(false)
  const handleStatusCheck = (isUnavailable: boolean) => {
    setIsPerlmutterUnavailable(isUnavailable)
  }
  const [selectedMode, setSelectedMode] = useState('pdb')
  const [mdEngine, setMdEngine] = useState<'charmm' | 'openmm'>('openmm')
  const [autoRgError, setAutoRgError] = useState<string | null>(null)
  const [useExampleData, setUseExampleData] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pdbWarning, setPdbWarning] = useState<ReactNode>('')
  const [pdbInfo, setPdbInfo] = useState<string>('')
  const [saxsData, setSaxsData] = useState<
    { q: number; intensity: number; error: number }[]
  >([])
  const [guinierRegion, setGuinierRegion] = useState<{
    qmin: number
    qmax: number
  } | null>(null)
  // Rg Max suggested by AutoRg, kept so we can reference it if the user
  // overrides Rg Max with an unreasonably large value.
  const [suggestedRgMax, setSuggestedRgMax] = useState<string | null>(null)

  // RTK Query to fetch the configuration
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  // Early return and Error handling
  if (configIsLoading) return <LinearProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration</Alert>
  if (!config)
    return <Alert severity="error">Configuration not available</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'
  const charmmEnabled = config.enableCharmmEngine?.toLowerCase() !== 'false'

  const initialValues: BilboMDClassicJobFormValues = {
    bilbomd_mode: 'pdb',
    title: '',
    psf_file: '',
    crd_file: '',
    pdb_file: '',
    inp_file: '',
    dat_file: '',
    num_conf: '3',
    rg: '',
    rg_min: '',
    rg_max: '',
    md_engine: 'openmm'
  }

  const onSubmit = async (values: BilboMDClassicJobFormValues) => {
    setSubmitError(null)
    const form = new FormData()
    form.append('bilbomd_mode', values.bilbomd_mode)
    form.append('title', values.title)
    form.append('psf_file', values.psf_file)
    form.append('crd_file', values.crd_file)
    form.append('pdb_file', values.pdb_file)
    form.append('num_conf', values.num_conf)
    form.append('rg', values.rg)
    form.append('rg_min', values.rg_min)
    form.append('rg_max', values.rg_max)
    form.append('dat_file', values.dat_file)
    form.append('inp_file', values.inp_file)
    form.append('md_engine', values.md_engine)
    if (useExampleData) {
      form.append('useExampleData', 'true')
    }

    try {
      await (mode === 'anonymous'
        ? addNewPublicJob(form).unwrap()
        : addNewJob(form).unwrap())
    } catch (error) {
      logger.error('rejected', error)
      setSubmitError(
        (error as { data?: { message?: string } }).data?.message ||
          'An error occurred during submission.'
      )
    }
  }

  const isFormValid = (values: BilboMDClassicJobFormValues) => {
    return (
      !isPerlmutterUnavailable &&
      values.title !== '' &&
      values.rg_max !== '' &&
      values.rg_min !== '' &&
      values.num_conf !== '' &&
      (useExampleData ||
        (values.inp_file !== '' &&
          values.dat_file !== '' &&
          (values.bilbomd_mode === 'pdb'
            ? values.pdb_file !== ''
            : values.psf_file !== '' && values.crd_file !== '')))
    )
  }

  const content = (
    <Grid
      container
      spacing={2}
    >
      <Grid size={{ xs: 12 }}>
        <NewJobFormInstructions />
      </Grid>

      <PipelineSchematic
        isDarkMode={isDarkMode}
        pipeline={selectedMode}
        mdEngine={mdEngine}
      />

      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Typography>BilboMD Classic Job Form</Typography>
        </HeaderBox>

        <Paper sx={{ p: 2 }}>
          {isSuccess ? (
            mode === 'anonymous' && publicJobResponse ? (
              <PublicJobSuccessAlert
                jobResponse={publicJobResponse}
                jobType={
                  selectedMode === 'pdb' ? 'Classic w/PDB' : 'Classic w/CRD/PSF'
                }
              />
            ) : authSuccessResponse ? (
              <JobSuccessAlert
                jobResponse={authSuccessResponse}
                jobType={
                  selectedMode === 'pdb' ? 'Classic w/PDB' : 'Classic w/CRD/PSF'
                }
              />
            ) : null
          ) : (
            <Formik
              initialValues={initialValues}
              validationSchema={
                useExampleData ? undefined : BilboMDClassicJobSchema
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
                setValues,
                validateForm
              }) => (
                <Form>
                  <Grid
                    container
                    columns={12}
                    sx={{ display: 'flex', flexDirection: 'column' }}
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
                      <Box sx={{ minWidth: '520px' }}>
                        <Field
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
                          sx={{ width: '100%' }}
                        />
                      </Box>
                      <Box sx={{ ml: 8, minWidth: 'fit-content' }}>
                        <Button
                          variant={useExampleData ? 'outlined' : 'contained'}
                          onClick={() => {
                            setUseExampleData(!useExampleData)
                            setSaxsData([])
                            setGuinierRegion(null)
                            setSuggestedRgMax(null)
                            if (!useExampleData) {
                              if (values.bilbomd_mode === 'pdb') {
                                void setFieldValue('pdb_file', '')
                                void setFieldValue('inp_file', '')
                                void setFieldValue('dat_file', '')
                              } else {
                                void setFieldValue('crd_file', '')
                                void setFieldValue('psf_file', '')
                                void setFieldValue('inp_file', '')
                                void setFieldValue('dat_file', '')
                              }
                              if (values.bilbomd_mode === 'pdb') {
                                void setFieldValue(
                                  'title',
                                  'example-bilbomd-pdb-job'
                                )
                                void setFieldValue('rg', '33')
                                void setFieldValue('rg_min', '30')
                                void setFieldValue('rg_max', '49')
                                void setFieldValue('num_conf', '2')
                              } else {
                                void setFieldValue(
                                  'title',
                                  'example-bilbomd-crd-psf-job'
                                )
                                void setFieldValue('rg', '27')
                                void setFieldValue('rg_min', '26')
                                void setFieldValue('rg_max', '41')
                                void setFieldValue('num_conf', '2')
                              }
                            } else {
                              void setFieldValue('psf_file', '')
                              void setFieldValue('crd_file', '')
                              void setFieldValue('pdb_file', '')
                              void setFieldValue('inp_file', '')
                              void setFieldValue('dat_file', '')
                              void setFieldValue('title', '')
                              void setFieldValue('rg_min', '')
                              void setFieldValue('rg_max', '')
                              void setFieldValue(
                                'num_conf',
                                values.md_engine === 'openmm' ? '3' : ''
                              )
                            }
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
                          href={
                            selectedMode === 'pdb'
                              ? '/api/v1/public/examples/classic/pdb'
                              : '/api/v1/public/examples/classic/crd'
                          }
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
                        Using example data for{' '}
                        {values.bilbomd_mode === 'pdb' ? 'PDB' : 'CRD/PSF'} mode
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

                    {/* MD Engine selection */}
                    <Grid sx={{ width: '520px' }}>
                      <MdEngineField
                        value={values.md_engine as 'charmm' | 'openmm'}
                        onChange={(val) => {
                          const newMode = val === 'charmm' ? 'crd_psf' : 'pdb'
                          void setFieldValue('md_engine', val)
                          void setFieldValue('bilbomd_mode', newMode)
                          setMdEngine(val)
                          setSelectedMode(newMode)
                          setUseExampleData(false)
                          void setFieldValue('pdb_file', '')
                          void setFieldValue('crd_file', '')
                          void setFieldValue('psf_file', '')
                          void setFieldValue('inp_file', '')
                          void setFieldValue('dat_file', '')
                          void setFieldValue('title', '')
                          void setFieldValue('rg_min', '')
                          void setFieldValue('rg_max', '')
                          void setFieldValue('num_conf', '')
                          setPdbWarning('')
                          setPdbInfo('')
                          setSaxsData([])
                          setGuinierRegion(null)
                          setSuggestedRgMax(null)
                          if (val === 'openmm') {
                            void setFieldValue('num_conf', '3')
                          }
                          setTimeout(() => void validateForm(), 0)
                        }}
                        disabled={isSubmitting}
                        disableCharmm={!charmmEnabled}
                      />
                    </Grid>

                    {values.bilbomd_mode === 'crd_psf' && (
                      <>
                        <Grid
                          container
                          direction="row"
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            width: '520px'
                          }}
                        >
                          <Grid>
                            <Field
                              name="crd_file"
                              id="crd-file-upload"
                              as={FileSelect}
                              title="Select File"
                              disabled={isSubmitting || useExampleData}
                              setFieldValue={setFieldValue}
                              setFieldTouched={setFieldTouched}
                              error={errors.crd_file && touched.crd_file}
                              errorMessage={
                                errors.crd_file ? errors.crd_file : ''
                              }
                              fileType="CHARMM-GUI *.crd"
                              fileExt=".crd"
                              existingFileName={
                                useExampleData ? 'example.crd' : undefined
                              }
                            />
                          </Grid>
                        </Grid>
                        <Grid
                          container
                          direction="row"
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            width: '520px'
                          }}
                        >
                          <Grid>
                            <Field
                              name="psf_file"
                              id="psf-file-upload"
                              as={FileSelect}
                              title="Select File"
                              disabled={isSubmitting || useExampleData}
                              setFieldValue={setFieldValue}
                              setFieldTouched={setFieldTouched}
                              error={errors.psf_file && touched.psf_file}
                              errorMessage={
                                errors.psf_file ? errors.psf_file : ''
                              }
                              fileType="CHARMM-GUI *.psf"
                              fileExt=".psf"
                              existingFileName={
                                useExampleData ? 'example.psf' : undefined
                              }
                            />
                          </Grid>
                        </Grid>
                      </>
                    )}
                    {values.bilbomd_mode === 'pdb' && (
                      <>
                        <Grid
                          container
                          direction="row"
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            width: '520px'
                          }}
                        >
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
                              errorMessage={
                                errors.pdb_file ? errors.pdb_file : ''
                              }
                              infoMessage={pdbInfo}
                              warningMessage={pdbWarning}
                              fileType=" *.pdb or *.cif"
                              fileExt=".pdb,.cif"
                              existingFileName={
                                useExampleData ? 'example.pdb' : undefined
                              }
                              onFileChange={async (file: File) => {
                                if (mdEngine !== 'openmm') {
                                  setPdbInfo('')
                                  setPdbWarning('')
                                  return
                                }
                                const [gaffFound, metalFound] =
                                  await Promise.all([
                                    detectGaffCofactors(file),
                                    detectMetalCofactors(file)
                                  ])
                                setPdbInfo(
                                  gaffFound.length > 0
                                    ? `The following molecules will be automatically parameterized using GAFF2 for OpenMM: ${gaffFound.join(', ')}`
                                    : ''
                                )
                                setPdbWarning(
                                  metalFound.length > 0 ? (
                                    <>
                                      The following metal-containing
                                      residues have no force-field
                                      parameters and will be removed
                                      before MD:{' '}
                                      {metalFound.join(', ')}. If
                                      these residues are important for
                                      your system, consider using{' '}
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
                                      structure, then return here with
                                      CRD and PSF files using the
                                      CHARMM engine option.
                                    </>
                                  ) : (
                                    ''
                                  )
                                )
                              }}
                            />
                          </Grid>
                        </Grid>
                      </>
                    )}
                    <Grid
                      container
                      direction="row"
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '520px'
                      }}
                    >
                      <Grid>
                        <Field
                          name="inp_file"
                          id="inp_file-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting || useExampleData}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          onBlur={handleBlur}
                          error={errors.inp_file && touched.inp_file}
                          errorMessage={errors.inp_file ? errors.inp_file : ''}
                          fileType="const.inp"
                          fileExt=".inp"
                          existingFileName={
                            useExampleData ? 'example-const.inp' : undefined
                          }
                        />
                      </Grid>
                    </Grid>
                    <Grid
                      container
                      direction="row"
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '520px'
                      }}
                    >
                      <Alert severity="info">
                        <Typography component="div">
                          Be sure to verify that the chain identifiers (
                          <b>segid</b>) and residue numbering in your{' '}
                          <b>const.inp</b> are consistent with your{' '}
                          <b>
                            {values.bilbomd_mode === 'pdb'
                              ? `*.pdb / *.cif`
                              : `*.crd`}
                          </b>{' '}
                          file.
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid
                      container
                      direction="row"
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '520px'
                      }}
                    >
                      <Grid>
                        <Field
                          name="dat_file"
                          id="dat_file-file-upload"
                          as={FileSelect}
                          title="Select File"
                          disabled={isSubmitting || isLoading || useExampleData}
                          setFieldValue={setFieldValue}
                          setFieldTouched={setFieldTouched}
                          error={errors.dat_file && touched.dat_file}
                          errorMessage={errors.dat_file ? errors.dat_file : ''}
                          fileType="experimental SAXS data"
                          fileExt=".dat"
                          isLoading={isLoading}
                          onFileChange={async (selectedFile: File) => {
                            setAutoRgError(null)
                            setSaxsData([])
                            setGuinierRegion(null)
                            setSuggestedRgMax(null)

                            // Parse SAXS data in the browser for the preview plot
                            try {
                              const text = await selectedFile.text()
                              const parsed = text
                                .split('\n')
                                .filter((line) => {
                                  const trimmed = line.trim()
                                  return (
                                    trimmed.length > 0 &&
                                    !trimmed.startsWith('#') &&
                                    /^\d/.test(trimmed)
                                  )
                                })
                                .map((line) => {
                                  const cols = line.trim().split(/\s+/)
                                  return {
                                    q: parseFloat(cols[0] ?? '0'),
                                    intensity: parseFloat(cols[1] ?? '0'),
                                    error: parseFloat(cols[2] ?? '0')
                                  }
                                })
                                .filter(
                                  (pt) =>
                                    isFinite(pt.q) &&
                                    isFinite(pt.intensity) &&
                                    pt.intensity > 0
                                )
                              setSaxsData(parsed)
                            } catch {
                              // Non-fatal — plot just won't show
                            }

                            const isExpdataValid =
                              await expdataSchema.isValid(selectedFile)
                            if (isExpdataValid) {
                              const formData = new FormData()
                              formData.append('dat_file', selectedFile)
                              try {
                                const { rg, rg_min, rg_max, qmin, qmax } =
                                  await calculateAutoRg(formData).unwrap()
                                void setValues(
                                  {
                                    ...values,
                                    dat_file: selectedFile,
                                    rg: String(rg),
                                    rg_min: String(rg_min),
                                    rg_max: String(rg_max)
                                  },
                                  true
                                )
                                void setFieldTouched('rg', true, false)
                                void setFieldTouched(
                                  'rg_min',
                                  true,
                                  false
                                )
                                void setFieldTouched(
                                  'rg_max',
                                  true,
                                  false
                                )
                                setSuggestedRgMax(String(rg_max))
                                if (
                                  typeof qmin === 'number' &&
                                  typeof qmax === 'number'
                                ) {
                                  setGuinierRegion({ qmin, qmax })
                                }
                              } catch (error) {
                                setSaxsData([])
                                setSuggestedRgMax(null)
                                setAutoRgError(
                                  `Failed to calculate Rg from *.dat file. Please check the file format and try again. ${error}`
                                )
                                void setFieldValue('rg_min', '')
                                void setFieldValue('rg_max', '')
                              }
                            } else {
                              setSaxsData([])
                              setSuggestedRgMax(null)
                              setAutoRgError(
                                `Invalid *.dat file format. Please check the file format and try again.`
                              )
                              void setFieldValue('rg_min', '')
                              void setFieldValue('rg_max', '')
                            }
                          }}
                          existingFileName={
                            useExampleData ? 'example-saxs.dat' : undefined
                          }
                        />
                      </Grid>
                    </Grid>
                    {saxsData.length > 0 && guinierRegion && (
                      <Grid sx={{ width: '520px' }}>
                        <SAXSGuinierPlot
                          data={saxsData}
                          qmin={guinierRegion.qmin}
                          qmax={guinierRegion.qmax}
                        />
                      </Grid>
                    )}
                    <Grid sx={{ display: 'flex', width: '520px' }}>
                      <Typography>
                        <b>Rg Min</b> and <b>Rg Max</b> will be calculated
                        automatically from the selected SAXS data file. Feel
                        free to change the suggested values.
                      </Typography>
                    </Grid>
                    {isLoading && (
                      <Box sx={{ my: 1, width: '520px' }}>
                        <LinearProgress />
                      </Box>
                    )}
                    {autoRgError && (
                      <Box sx={{ my: 1, width: '520px' }}>
                        <Alert severity="error">{autoRgError}</Alert>
                      </Box>
                    )}
                    <Grid sx={{ my: 2, display: 'flex', width: '520px' }}>
                      <Field
                        label="Rg Min"
                        fullWidth
                        id="rg_min"
                        name="rg_min"
                        type="text"
                        disabled={isSubmitting || isLoading}
                        as={TextField}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={errors.rg_min && touched.rg_min}
                        helperText={
                          errors.rg_min && touched.rg_min
                            ? errors.rg_min
                            : 'Min value of Rg ...(between 10 and 100)'
                        }
                      />
                    </Grid>
                    <Grid sx={{ my: 2, display: 'flex', width: '520px' }}>
                      <Field
                        label="Rg Max"
                        fullWidth
                        id="rg_max"
                        name="rg_max"
                        type="text"
                        disabled={isSubmitting || isLoading}
                        as={TextField}
                        error={errors.rg_max && touched.rg_max}
                        helperText={
                          errors.rg_max && touched.rg_max
                            ? errors.rg_max
                            : 'Max value of Rg ...(between 10 and 100)'
                        }
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                    </Grid>
                    {(() => {
                      const warning = getRgMaxWarning(values.rg, values.rg_max)
                      if (!warning) return null
                      return (
                        <Grid sx={{ mb: 2, width: '520px' }}>
                          <Alert severity="warning">
                            Your <b>Rg Max</b> ({warning.rgMax} Å) is{' '}
                            {warning.ratio}× your measured Rg ({warning.rg} Å).
                            Targeting an Rg this much larger than the measured
                            value can cause numerical instability and may crash
                            the MD simulation.
                            {suggestedRgMax
                              ? ` The auto-calculated suggestion was ${suggestedRgMax} Å.`
                              : ''}{' '}
                            Consider reducing <b>Rg Max</b> to around{' '}
                            {warning.recommended} Å.
                          </Alert>
                        </Grid>
                      )
                    })()}
                    <Grid sx={{ my: 2, display: 'flex', width: '520px' }}>
                      <Field
                        name="num_conf"
                        as={TextField}
                        label="Conformations per Rg"
                        variant="outlined"
                        id="num_conf"
                        select
                        sx={{ width: '520px' }}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        disabled={isSubmitting || values.md_engine === 'openmm'}
                        error={Boolean(errors.num_conf && touched.num_conf)}
                        helperText={
                          errors.num_conf && touched.num_conf
                            ? errors.num_conf
                            : values.md_engine === 'openmm'
                              ? 'OpenMM uses a fixed setting (600)'
                              : 'Number of conformations to sample per Rg'
                        }
                      >
                        <MenuItem
                          key="1"
                          value="1"
                        >
                          200
                        </MenuItem>
                        <MenuItem
                          key="2"
                          value="2"
                        >
                          400
                        </MenuItem>
                        <MenuItem
                          key="3"
                          value="3"
                        >
                          600
                        </MenuItem>
                        <MenuItem
                          key="4"
                          value="4"
                        >
                          800
                        </MenuItem>
                      </Field>
                    </Grid>
                    {isSubmitting && (
                      <Box sx={{ width: '520px' }}>
                        <LinearProgress />
                      </Box>
                    )}
                    <Grid
                      size={{ xs: 6 }}
                      sx={{ my: 2 }}
                    >
                      <Button
                        type="submit"
                        disabled={
                          (!isValid && !useExampleData) || !isFormValid(values)
                        }
                        loading={isSubmitting}
                        endIcon={<SendIcon />}
                        loadingPosition="end"
                        variant="contained"
                        sx={{ width: '110px' }}
                      >
                        Submit
                      </Button>
                      {((!isValid && !useExampleData) ||
                        !isFormValid(values)) && (
                        <Typography
                          variant="body2"
                          color="error"
                          sx={{
                            mt: 1,
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-line'
                          }}
                        >
                          {Object.entries(errors)
                            .filter(
                              ([key, value]) =>
                                value &&
                                (useExampleData
                                  ? ![
                                      'psf_file',
                                      'crd_file',
                                      'pdb_file',
                                      'inp_file',
                                      'dat_file'
                                    ].includes(key)
                                  : true)
                            )
                            .map(([, value]) => value)
                            .join('\n')}
                        </Typography>
                      )}
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
  )

  return content
}

export default NewJobForm
