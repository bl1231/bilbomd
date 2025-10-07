import {
  Typography,
  Paper,
  Alert,
  Button,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  FormGroup,
  FormControlLabel,
  Checkbox
} from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field, FormikHelpers } from 'formik'
import { useState, useEffect, useMemo } from 'react'
import { af2paeJiffySchema } from 'schemas/Alphafold2PAEValidationSchema'
import FileSelect from 'features/jobs/FileSelect'
import { Debug } from 'components/Debug'
import SendIcon from '@mui/icons-material/Send'
import Download from './DownloadAF2PAEfile'
import { Box } from '@mui/system'
import {
  useAf2PaeJiffyMutation,
  useGetAf2PaeStatusQuery,
  useGetAf2PaeConstFileQuery
} from 'slices/jobsApiSlice'
import {
  useGetVizJsonQuery,
  useGetPaeBinQuery,
  useGetVizPngQuery
} from 'slices/alphafoldPaeVizSlice'
import LinearProgress from '@mui/material/LinearProgress'
import HeaderBox from 'components/HeaderBox'
import PaeCutoffSlider from './PaeCutoffSlider'
import LeidenResolutionSlider from './LeidenResolutionSlider'
import PlddtSlider from './PlddtSlider'
import PAEJiffyInstructions from './PAEJiffyInstructions'
import ConstInpFile from './ConstInpFile'
import PAEMatrixPlot from './PAEMatrixPlot'
import PAEMatrixPlotExplanation from './PAEMatrixPlotExplanation'
import PLDDTPlot from './PLDDTPlot'
import { parsePLDDTFromPDB, PLDDTData } from '../../utils/pdbUtils'

interface FileWithDeets extends File {
  name: string
}

interface FormValues {
  pdb_file: FileWithDeets | null
  pae_file: FileWithDeets | null
  pae_cutoff: string
  plddt_cutoff: string
  leiden_resolution: string
}

const Alphafold2PAEJiffy = () => {
  const [originalFiles, setOriginalFiles] = useState<{
    pdb_file: FileWithDeets | null
    pae_file: FileWithDeets | null
  }>({ pdb_file: null, pae_file: null })

  const [calculateAf2PaeJiffy, { error, isError }] = useAf2PaeJiffyMutation({})
  const [success, setSuccess] = useState(false)
  const [uuid, setUuid] = useState('')
  const [status, setStatus] = useState('')
  const [constfile, setConstfile] = useState('')
  const [shapeCount, setShapeCount] = useState(0)
  const [jobStartTime, setJobStartTime] = useState<number | null>(null)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [showRigid, setShowRigid] = useState(true)
  const [showFixed, setShowFixed] = useState(true)
  const [showClusters, setShowClusters] = useState(true)
  const [plddtData, setPlddtData] = useState<PLDDTData[]>([])
  const [chainBoundaries, setChainBoundaries] = useState<number[]>([])

  const { data: statusData, isError: statusIsError } = useGetAf2PaeStatusQuery(
    uuid,
    {
      skip: !uuid || status === 'completed' || status === 'failed',
      pollingInterval: 5000
    }
  )

  useEffect(() => {
    if (statusData?.status) {
      setStatus(statusData.status)
    }
  }, [statusData])

  const [formInitialValues, setFormInitialValues] = useState<FormValues>({
    pdb_file: originalFiles.pdb_file,
    pae_file: originalFiles.pae_file,
    plddt_cutoff: '50',
    pae_cutoff: '10',
    leiden_resolution: '0.35'
  })

  const onSubmit = async (values: FormValues) => {
    const form = new FormData()
    if (!values.pdb_file || !values.pae_file) {
      // Handle error or return early
      return
    }
    form.append('pdb_file', values.pdb_file, values.pdb_file.name)
    form.append('pae_file', values.pae_file, values.pae_file.name)
    form.append('pae_cutoff', values.pae_cutoff)
    form.append('plddt_cutoff', values.plddt_cutoff)
    form.append('leiden_resolution', values.leiden_resolution)
    try {
      const response = await calculateAf2PaeJiffy(form).unwrap()
      setUuid(response.uuid)
      setJobStartTime(Date.now())
      setSuccess(true)
      setFormInitialValues(values)
    } catch (error) {
      console.error('Error submitting form:', error)
    }
  }

  useEffect(() => {
    if (!success || status === 'completed') return
    const interval = setInterval(() => {
      setTimeElapsed((prev) => {
        if (jobStartTime) {
          return Math.floor((Date.now() - jobStartTime) / 1000)
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [success, status, jobStartTime])

  const handleTryNewParameters = (
    values: FormValues,
    resetForm: FormikHelpers<FormValues>['resetForm']
  ) => {
    const newInitial = {
      ...formInitialValues,
      pae_cutoff: values.pae_cutoff,
      plddt_cutoff: values.plddt_cutoff,
      leiden_resolution: values.leiden_resolution,
      pdb_file: originalFiles.pdb_file,
      pae_file: originalFiles.pae_file
    }

    setFormInitialValues(newInitial)
    resetForm({ values: newInitial })
    setSuccess(false)
    setUuid('')
    setStatus('')
    setConstfile('')
    setShapeCount(0)
  }

  const handleReset = () => {
    setSuccess(false)
    setUuid('')
    setStatus('')
    setConstfile('')
    setShapeCount(0)
    setOriginalFiles({ pdb_file: null, pae_file: null })
  }

  const skipQuery = !uuid || status !== 'completed'

  const {
    data: constInpData,
    error: fileError,
    isLoading: constFileIsLoading
  } = useGetAf2PaeConstFileQuery(uuid, {
    skip: skipQuery
  })

  // --- PAE viz helpers start
  // Convert Base64 string (from RTK transformResponse) back to ArrayBuffer
  function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }

  function reshapeFloat32(
    buf: ArrayBuffer,
    length: number,
    downsample = 1
  ): number[][] {
    const Lds = Math.floor(length / (downsample || 1))
    const floats = new Float32Array(buf)
    // guard: infer size if metadata mismatches
    const N =
      floats.length === Lds * Lds ? Lds : Math.floor(Math.sqrt(floats.length))
    const out: number[][] = Array.from({ length: N }, () => Array(N).fill(0))
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        out[i][j] = floats[i * N + j]
      }
    }
    return out
  }
  // --- PAE viz helpers end

  // --- PAE viz artifact hooks
  const { data: viz, isSuccess: vizOk } = useGetVizJsonQuery(uuid, {
    skip: skipQuery
  })
  const { data: paeBuf, isSuccess: binOk } = useGetPaeBinQuery(uuid, {
    skip: skipQuery
  })
  const { data: vizPng, isSuccess: vizPngOk } = useGetVizPngQuery(uuid, {
    skip: skipQuery
  })

  const matrix = useMemo(() => {
    if (!vizOk || !binOk || !viz || !paeBuf) return null
    try {
      const buf =
        typeof paeBuf === 'string'
          ? base64ToArrayBuffer(paeBuf)
          : (paeBuf as ArrayBuffer)
      return reshapeFloat32(buf, viz.length, viz.downsample ?? 1)
    } catch (e) {
      console.error('Failed to parse pae.bin', e)
      return null
    }
  }, [vizOk, binOk, viz, paeBuf])

  useEffect(() => {
    if (constInpData) {
      const shapeCount = (constInpData.match(/shape/g) || []).length
      setShapeCount(shapeCount)
      setConstfile(constInpData)
    }
  }, [constInpData])

  useEffect(() => {
    if (status === 'completed' && originalFiles.pdb_file) {
      // Assuming you can read the PDB file content; adjust if needed
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        const { data, chainBoundaries } = parsePLDDTFromPDB(content)
        setPlddtData(data)
        setChainBoundaries(chainBoundaries)
      }
      reader.readAsText(originalFiles.pdb_file)
    }
  }, [status, originalFiles.pdb_file])

  const content = (
    <Grid
      container
      spacing={2}
    >
      <Grid size={{ xs: 12 }}>
        <PAEJiffyInstructions />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Typography>Create const.inp from AlphaFold PAE</Typography>
        </HeaderBox>
        <Paper sx={{ p: 1 }}>
          <Formik
            initialValues={formInitialValues}
            validationSchema={af2paeJiffySchema}
            onSubmit={onSubmit}
            enableReinitialize={true}
          >
            {({
              values,
              touched,
              errors,
              isValid,
              isSubmitting,
              setFieldValue,
              setFieldTouched,
              resetForm
            }) => {
              if (success) {
                return (
                  <>
                    {success && status !== 'completed' && (
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          my: 3
                        }}
                      >
                        <CircularProgress />
                        <Typography sx={{ mt: 2 }}>
                          Waiting for job to complete... current status:{' '}
                          {status}
                        </Typography>
                        <Typography sx={{ mt: 1, color: 'error.main' }}>
                          Jobs can take 5-6 minutes.
                        </Typography>
                        <Typography
                          sx={{ mt: 1, fontSize: '1.2rem' }}
                          data-testid="job-timer"
                        >
                          Time elapsed:{' '}
                          {`${Math.floor(timeElapsed / 60)
                            .toString()
                            .padStart(2, '0')} min ${(timeElapsed % 60)
                            .toString()
                            .padStart(2, '0')} sec`}
                        </Typography>
                      </Box>
                    )}
                    {statusIsError && (
                      <Typography color="error">
                        Error checking job status
                      </Typography>
                    )}
                    {constFileIsLoading && (
                      <Typography>Loading const.inp file...</Typography>
                    )}
                    {fileError && (
                      <Typography color="error">
                        Error fetching const.inp file
                      </Typography>
                    )}

                    {status === 'completed' && (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 2
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Alert
                              severity={shapeCount >= 20 ? 'error' : 'success'}
                            >
                              <AlertTitle>
                                {shapeCount >= 20 ? 'Error' : 'Success'}
                              </AlertTitle>
                              Your CHARMM-compatible <code>const.inp</code> file
                              was successfully created!{' '}
                              {values && shapeCount >= 20
                                ? `But with this Clustering Configuration there are ${shapeCount} rigid bodies which is too many for CHARMM to handle.`
                                : ''}
                              <br />
                              {values && (
                                <>
                                  <TableContainer sx={{ width: '400px' }}>
                                    <Table aria-label="simple table">
                                      <TableBody>
                                        <TableRow>
                                          <TableCell>
                                            <b>PDB File</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {values.pdb_file?.name}
                                          </TableCell>
                                        </TableRow>
                                        <TableRow>
                                          <TableCell>
                                            <b>PAE File</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {values.pae_file?.name}
                                          </TableCell>
                                        </TableRow>
                                        <TableRow>
                                          <TableCell>
                                            <b>PAE Cutoff</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {parseFloat(
                                              values.pae_cutoff
                                            ).toFixed(1)}
                                            Å
                                          </TableCell>
                                        </TableRow>
                                        <TableRow>
                                          <TableCell>
                                            <b>Leiden Resolution</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {parseFloat(
                                              values.leiden_resolution
                                            ).toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                        <TableRow>
                                          <TableCell>
                                            <b>pLDDT Cutoff</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {parseFloat(
                                              values.plddt_cutoff
                                            ).toFixed(1)}
                                            Å
                                          </TableCell>
                                        </TableRow>
                                        <TableRow>
                                          <TableCell>
                                            <b>CHARMM shapes (max 20)</b>
                                          </TableCell>
                                          <TableCell align="right">
                                            {shapeCount}
                                          </TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                </>
                              )}
                            </Alert>
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0, ml: 2 }}>
                            <ConstInpFile constfile={constfile} />
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'row',
                                pt: 2,
                                gap: 2
                              }}
                            >
                              <Download uuid={uuid} />
                              <Button
                                variant="contained"
                                onClick={() =>
                                  handleTryNewParameters(values, resetForm)
                                }
                              >
                                Try New Parameters
                              </Button>
                              <Button
                                variant="outlined"
                                type="button"
                                onClick={() => {
                                  handleReset()
                                  const resetValues = {
                                    pdb_file: null,
                                    pae_file: null,
                                    pae_cutoff: '10.0',
                                    plddt_cutoff: '50',
                                    leiden_resolution: '0.35'
                                  }
                                  resetForm({ values: resetValues })
                                  setFormInitialValues(resetValues)
                                }}
                              >
                                Reset
                              </Button>
                            </Box>
                          </Box>
                        </Box>
                        <Box sx={{ mt: 2 }}>
                          <HeaderBox>
                            <Typography>Visualization</Typography>
                          </HeaderBox>
                          <Paper sx={{ p: 1 }}>
                            <FormGroup
                              row
                              sx={{ mb: 1 }}
                            >
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={showRigid}
                                    onChange={(e) =>
                                      setShowRigid(e.target.checked)
                                    }
                                    size="small"
                                  />
                                }
                                label="Show rigid"
                              />
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={showFixed}
                                    onChange={(e) =>
                                      setShowFixed(e.target.checked)
                                    }
                                    size="small"
                                  />
                                }
                                label="Show fixed"
                              />
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={showClusters}
                                    onChange={(e) =>
                                      setShowClusters(e.target.checked)
                                    }
                                    size="small"
                                  />
                                }
                                label="Show clusters"
                              />
                            </FormGroup>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                              <Box sx={{ flexShrink: 0, mr: 2 }}>
                                {matrix ? (
                                  <PAEMatrixPlot
                                    matrix={matrix}
                                    viz={viz}
                                    showRigid={showRigid}
                                    showFixed={showFixed}
                                    showClusters={showClusters}
                                  />
                                ) : vizPngOk && vizPng ? (
                                  <img
                                    alt="PAE visualization"
                                    src={vizPng as string}
                                    style={{
                                      maxWidth: 420,
                                      border: '1px solid #ccc'
                                    }}
                                    onLoad={(e) => {
                                      // Revoke URL after image loads to avoid memory leaks
                                      const target =
                                        e.currentTarget as HTMLImageElement
                                      URL.revokeObjectURL(target.src)
                                    }}
                                  />
                                ) : (
                                  <Typography variant="body2">
                                    Loading visualization…
                                  </Typography>
                                )}
                                {!matrix && (
                                  <Typography
                                    variant="caption"
                                    sx={{ display: 'block', mt: 1 }}
                                  >
                                    Showing static fallback while binary matrix
                                    loads.
                                  </Typography>
                                )}
                              </Box>
                              <Box sx={{ flexShrink: 0, mr: 2 }}>
                                <PLDDTPlot
                                  plddtData={plddtData}
                                  plddtCutoff={parseFloat(values.plddt_cutoff)}
                                  chainBoundaries={chainBoundaries}
                                />
                              </Box>
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <PAEMatrixPlotExplanation />
                            </Box>
                          </Paper>
                        </Box>
                      </>
                    )}
                  </>
                )
              } else {
                return (
                  <Form>
                    <Grid
                      container
                      columns={12}
                      direction="column"
                      sx={{ display: 'flex' }}
                    >
                      {isError && (
                        <Alert
                          severity="error"
                          sx={{ my: 2 }}
                        >
                          <AlertTitle>Error</AlertTitle>
                          {(() => {
                            if (!error) return 'An unknown error occurred.'
                            if (typeof error === 'string') return error
                            if (
                              'data' in error &&
                              typeof error.data === 'object' &&
                              error.data !== null &&
                              'message' in error.data
                            ) {
                              return (
                                (error.data as { message?: string }).message ||
                                'An error occurred.'
                              )
                            }
                            if ('message' in error) {
                              return (
                                (error as { message?: string }).message ||
                                'An error occurred.'
                              )
                            }
                            return 'An unknown error occurred.'
                          })()}
                        </Alert>
                      )}
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
                        fileType="AlphaFold2 PDB *.pdb"
                        fileExt=".pdb"
                        onFileChange={(file: FileWithDeets) => {
                          void setFieldValue('pdb_file', file)
                          setOriginalFiles({
                            ...originalFiles,
                            pdb_file: file
                          })
                        }}
                      />
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
                        onFileChange={(file: FileWithDeets) => {
                          void setFieldValue('pae_file', file)
                          setOriginalFiles({
                            ...originalFiles,
                            pae_file: file
                          })
                        }}
                      />
                      <Field
                        name="pae_cutoff"
                        id="pae-cutoff-slider"
                        as={PaeCutoffSlider}
                        setFieldValue={setFieldValue}
                        value={values.pae_cutoff}
                      />
                      <Field
                        name="plddt_cutoff"
                        id="plddt-cutoff-slider"
                        as={PlddtSlider}
                        setFieldValue={setFieldValue}
                        value={values.plddt_cutoff}
                      />
                      <Field
                        name="leiden_resolution"
                        id="leiden-resolution-slider"
                        as={LeidenResolutionSlider}
                        setFieldValue={setFieldValue}
                        value={values.leiden_resolution}
                      />
                      {isSubmitting && (
                        <Box sx={{ mt: 1, width: '420px' }}>
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
                            !isValid ||
                            values.pdb_file === null ||
                            values.pae_file === null
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
                      {process.env.NODE_ENV === 'development' ? <Debug /> : ''}
                    </Grid>
                  </Form>
                )
              }
            }}
          </Formik>
        </Paper>
      </Grid>
    </Grid>
  )

  return content
}

export default Alphafold2PAEJiffy
