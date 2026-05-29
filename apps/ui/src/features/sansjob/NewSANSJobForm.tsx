import { useState } from 'react'
import type { ReactNode } from 'react'
import { parseCifAtomSite } from '@bilbomd/bilbomd-types'
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Slider,
  Chip
} from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field } from 'formik'
import FileSelect from 'features/jobs/FileSelect'
import {
  useAddNewSANSJobMutation,
  useCalculateAutoRgMutation
} from 'slices/jobsApiSlice'
import { useAddNewPublicSANSJobMutation } from 'slices/publicJobsApiSlice'
import SendIcon from '@mui/icons-material/Send'
import { BilboMDSANSJobSchema } from 'schemas/BilboMDSANSJobSchema'
import { expdataSchema } from 'schemas/ExpdataSchema'
import { Debug } from 'components/Debug'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import useTitle from 'hooks/useTitle'
import { NewSANSJobFormValues } from '../../types/sansForm'
import NewSANSJobFormInstructions from './NewSANSJobFormInstructions'
import NerscStatusChecker from 'features/nersc/NerscStatusChecker'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import ChainDeuterationSlider from './ChainDeuterationSlider'
import {
  detectGaffCofactors,
  detectMetalCofactors
} from 'schemas/ValidationFunctions'
import PublicJobSuccessAlert from 'features/public/PublicJobSuccessAlert'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'
import SANSPipelineSchematic from './SANSPipelineSchematic'

type NewJobFormProps = {
  mode?: 'authenticated' | 'anonymous'
}

const PipelineSchematic = () => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox>
      <Typography>BilboMD SANS Schematic</Typography>
    </HeaderBox>
    <Paper sx={{ p: 2 }}>
      <SANSPipelineSchematic />
    </Paper>
  </Grid>
)

const NewSANSJob = ({ mode = 'authenticated' }: NewJobFormProps) => {
  useTitle(
    mode === 'anonymous'
      ? 'BilboMD: New SANS Job (anonymous)'
      : 'BilboMD: New SANS Job'
  )

  const [addNewSANSJob, { isSuccess: isAuthSuccess, data: authJobResponse }] =
    useAddNewSANSJobMutation()
  const [
    addNewPublicSANSJob,
    { isSuccess: isAnonSuccess, data: anonJobResponse }
  ] = useAddNewPublicSANSJobMutation()
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

  const [calculateAutoRg, { isLoading }] = useCalculateAutoRgMutation()
  const [isPerlmutterUnavailable, setIsPerlmutterUnavailable] = useState(false)
  const [chainIds, setChainIds] = useState<string[]>([])
  const [autoRgError, setAutoRgError] = useState<string | null>(null)
  const [pdbInfo, setPdbInfo] = useState<string>('')
  const [pdbWarning, setPdbWarning] = useState<ReactNode>('')

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

  const useNersc = config.useNersc?.toLowerCase() === 'true'


  const handleStatusCheck = (isUnavailable: boolean) => {
    setIsPerlmutterUnavailable(isUnavailable)
  }

  const initialValues: NewSANSJobFormValues = {
    title: '',
    pdb_file: '',
    dat_file: '',
    rg: 0,
    rg_min: 0,
    rg_max: 0,
    inp_file: '',
    d2o_fraction: 100,
    md_engine: 'openmm'
  }

  const onSubmit = async (values: NewSANSJobFormValues) => {
    const form = new FormData()
    form.append('title', values.title)
    form.append('pdb_file', values.pdb_file)
    form.append('dat_file', values.dat_file)
    form.append('rg', values.rg.toString())
    form.append('rg_min', values.rg_min.toString())
    form.append('rg_max', values.rg_max.toString())
    form.append('inp_file', values.inp_file)
    form.append('d2o_fraction', values.d2o_fraction.toString())
    form.append('bilbomd_mode', 'sans')
    form.append('md_engine', values.md_engine)

    chainIds.forEach((chainId) => {
      const key =
        `deuteration_fraction_${chainId}` as keyof NewSANSJobFormValues
      if (key in values) {
        form.append(key, values[key]!.toString())
      }
    })

    try {
      await (mode === 'anonymous'
        ? addNewPublicSANSJob(form).unwrap()
        : addNewSANSJob(form).unwrap())
    } catch (error) {
      console.error('rejected', error)
    }
  }

  const parsePDBFile = (fileContent: string): string[] => {
    const lines = fileContent.split('\n')
    const chainIdsSet: Set<string> = new Set()
    lines.forEach((line) => {
      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const chainId = line.substring(21, 22).trim()
        if (chainId) chainIdsSet.add(chainId)
      }
    })
    return Array.from(chainIdsSet)
  }

  const parseCIFFile = (fileContent: string): string[] => {
    const parsed = parseCifAtomSite(fileContent)
    if (!parsed) return []
    const idx = parsed.columnNames.indexOf('auth_asym_id')
    if (idx === -1) return []
    const chainIds = new Set<string>()
    for (const row of parsed.dataRows) {
      const val = row[idx]
      if (val && val !== '.' && val !== '?') chainIds.add(val)
    }
    return Array.from(chainIds)
  }

  const isFormValid = (values: NewSANSJobFormValues) => {
    const hasValidDeuteration = chainIds.every(
      (chainId) =>
        (values[`deuteration_fraction_${chainId}`] ?? 0) >= 0 &&
        (values[`deuteration_fraction_${chainId}`] ?? 0) <= 100
    )

    return (
      !isPerlmutterUnavailable &&
      values.title !== '' &&
      values.pdb_file !== '' &&
      values.dat_file !== '' &&
      values.inp_file !== '' &&
      values.d2o_fraction >= 0 &&
      values.d2o_fraction <= 100 &&
      hasValidDeuteration
    )
  }

  const content = (
    <Grid
      container
      spacing={2}
    >
      <NewSANSJobFormInstructions />

      <PipelineSchematic />

      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography>BilboMD SANS Job Form</Typography>
            <Typography
              component="span"
              sx={{ color: 'yellow', ml: 1 }}
            >
              *Experimental - Please report problems to Scott
            </Typography>
          </Box>
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
            <Formik<NewSANSJobFormValues>
              initialValues={initialValues}
              validationSchema={BilboMDSANSJobSchema}
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
                    sx={{ flexDirection: 'column' }}
                  >
                    {useNersc && (
                      <NerscStatusChecker
                        systemName="perlmutter"
                        onStatusCheck={handleStatusCheck}
                      />
                    )}

                    {/* Title */}
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

                    {/* PDB file */}
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
                        infoMessage={pdbInfo}
                        warningMessage={pdbWarning}
                        fileType="Starting PDB or CIF file *.pdb, *.cif"
                        fileExt=".pdb,.cif"
                        onFileChange={async (selectedFile: File) => {
                          const isCif = selectedFile.name
                            .toLowerCase()
                            .endsWith('.cif')
                          const reader = new FileReader()
                          reader.onload = (e) => {
                            const content = e.target?.result as string
                            setChainIds(
                              isCif
                                ? parseCIFFile(content)
                                : parsePDBFile(content)
                            )
                          }
                          reader.readAsText(selectedFile)

                          if (!isCif) {
                            const [gaffFound, metalFound] = await Promise.all([
                              detectGaffCofactors(selectedFile),
                              detectMetalCofactors(selectedFile)
                            ])
                            setPdbInfo(
                              gaffFound.length > 0
                                ? `The following molecules will be automatically parameterized using GAFF2 for OpenMM: ${gaffFound.join(', ')}`
                                : ''
                            )
                            setPdbWarning(
                              metalFound.length > 0 ? (
                                <>
                                  The following metal-containing residues
                                  have no force-field parameters and will
                                  be removed before MD:{' '}
                                  {metalFound.join(', ')}. If these
                                  residues are important for your system,
                                  consider using{' '}
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
                                  to properly parameterize your structure.
                                </>
                              ) : (
                                ''
                              )
                            )
                          } else {
                            setPdbInfo('')
                            setPdbWarning('')
                          }
                        }}
                      />
                    </Grid>

                    {/* SANS dat file */}
                    <Grid>
                      <Field
                        name="dat_file"
                        id="dat-file-upload"
                        as={FileSelect}
                        title="Select File"
                        disabled={isSubmitting || isLoading}
                        setFieldValue={setFieldValue}
                        setFieldTouched={setFieldTouched}
                        error={errors.dat_file && touched.dat_file}
                        errorMessage={errors.dat_file ? errors.dat_file : ''}
                        fileType="experimental SANS data"
                        fileExt=".dat"
                        onFileChange={async (selectedFile: File) => {
                          setAutoRgError(null)
                          const isExpdataValid =
                            await expdataSchema.isValid(selectedFile)
                          if (isExpdataValid) {
                            const formData = new FormData()
                            formData.append('dat_file', selectedFile)
                            try {
                              const { rg, rg_min, rg_max } =
                                await calculateAutoRg(formData).unwrap()
                              void setFieldValue('rg', rg)
                              void setFieldValue('rg_min', rg_min)
                              void setFieldValue('rg_max', rg_max)
                            } catch (error) {
                              setAutoRgError(
                                `Failed to calculate Rg from *.dat file. Please check the file format and try again. ${error}`
                              )
                              void setFieldValue('rg_min', '')
                              void setFieldValue('rg_max', '')
                            }
                          } else {
                            setAutoRgError(
                              `Invalid *.dat file format. Please check the file format and try again.`
                            )
                            void setFieldValue('rg_min', '')
                            void setFieldValue('rg_max', '')
                          }
                        }}
                      />
                    </Grid>
                    <Grid sx={{ display: 'flex', width: '520px' }}>
                      <Alert severity="info">
                        <Typography>
                          <b>Rg Min</b> and <b>Rg Max</b> will be calculated
                          automatically from the selected SANS data file. Feel
                          free to change the suggested values.
                        </Typography>
                      </Alert>
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
                    {/* Rg Min */}
                    <Grid sx={{ my: 2, display: 'flex', width: '520px' }}>
                      <Field
                        label="Rg Min"
                        fullWidth
                        id="rg_min"
                        name="rg_min"
                        type="number"
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
                        slotProps={{ htmlInput: { min: 10, max: 100 } }}
                      />
                    </Grid>

                    {/* rRg Max */}
                    <Grid sx={{ my: 2, display: 'flex', width: '520px' }}>
                      <Field
                        label="Rg Max"
                        fullWidth
                        id="rg_max"
                        name="rg_max"
                        type="number"
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
                        slotProps={{ htmlInput: { min: 0, max: 100 } }}
                      />
                    </Grid>

                    {/* const.inp file */}
                    <Grid>
                      <Field
                        name="inp_file"
                        id="const-inp-file-upload"
                        as={FileSelect}
                        title="Select File"
                        disabled={isSubmitting}
                        setFieldValue={setFieldValue}
                        setFieldTouched={setFieldTouched}
                        error={errors.inp_file && touched.inp_file}
                        errorMessage={errors.inp_file ? errors.inp_file : ''}
                        fileType="CHARMM const.inp file"
                        fileExt=".inp"
                      />
                    </Grid>

                    {/* D2O Fraction Slider */}
                    <Grid sx={{ my: 2, width: '520px' }}>
                      <Typography
                        id="d2o-fraction-slider"
                        gutterBottom
                      >
                        Solvent D<sub>2</sub>O Fraction
                      </Typography>
                      <Grid
                        container
                        spacing={2}
                        sx={{ alignItems: 'center' }}
                      >
                        <Grid>
                          <Chip
                            label={`${values.d2o_fraction}%`}
                            variant="outlined"
                            color="success"
                            sx={{
                              width: 60, // Set a fixed width
                              justifyContent: 'center' // Center the label
                            }}
                          />
                        </Grid>
                        <Grid sx={{ flex: 1 }}>
                          <Slider
                            aria-labelledby="d2o-fraction-slider"
                            name="d2o_fraction"
                            value={values.d2o_fraction}
                            onChange={(_event, value) => {
                              void setFieldValue('d2o_fraction', value)
                            }}
                            min={0}
                            max={100}
                            step={1}
                            valueLabelDisplay="off"
                            disabled={isSubmitting}
                            track={false}
                          />
                        </Grid>
                        {errors.d2o_fraction && touched.d2o_fraction ? (
                          <Typography color="error">
                            {errors.d2o_fraction}
                          </Typography>
                        ) : null}
                      </Grid>
                    </Grid>

                    {/* Dynamic Deuteration Fraction Sliders */}
                    {chainIds.length > 0 && (
                      <div style={{ display: 'none' }}>
                        <ChainDeuterationSlider
                          chainIds={chainIds}
                          values={values}
                          errors={errors}
                          touched={touched}
                          isSubmitting={isSubmitting}
                          setFieldValue={setFieldValue}
                        />
                      </div>
                    )}

                    {/* Progress Bar */}
                    {isSubmitting && (
                      <Box sx={{ my: 1, width: '520px' }}>
                        <LinearProgress />
                      </Box>
                    )}

                    {/* Submit Button */}
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
                        Submit
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
  )

  return content
}

export default NewSANSJob
