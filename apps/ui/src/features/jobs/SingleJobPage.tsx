import { useEffect, useState, lazy, Suspense } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router'
import PulseLoader from 'react-spinners/PulseLoader'
import useTitle from 'hooks/useTitle'
import {
  Button,
  Typography,
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace'
import { useTheme } from '@mui/material/styles'
import { axiosInstance } from 'app/api/axios'
import MissingJob from 'components/MissingJob'
import { useSelector } from 'react-redux'
import { selectCurrentToken } from 'slices/authSlice'
import BilboMDNerscSteps from './BilboMDNerscSteps'
import BilboMDMongoSteps from './BilboMDMongoSteps'
import HeaderBox from 'components/HeaderBox'
import JobDBDetails from './JobDBDetails'
import MultiMDJobDBDetails from 'features/multimd/MultiMDJobDBDetails'
import MolstarViewer from 'features/molstar/Viewer'
import ScoperFoXSAnalysis from 'features/scoperjob/ScoperFoXSAnalysis'
const FoXSAnalysis = lazy(() => import('./FoXSAnalysis'))
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import {
  useGetJobByIdQuery,
  useDeleteJobMutation,
  useGetMDMoviesQuery
} from 'slices/jobsApiSlice'
import { skipToken } from '@reduxjs/toolkit/query'
import BilboMdFeedback from 'features/analysis/BilboMdFeedback'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import { JobStatusEnum } from '@bilbomd/mongodb-schema/frontend'
import Item from 'themes/components/Item'
import MovieGallery from 'features/analysis/MovieGallery'
import { getStatusColors } from 'features/shared/StatusColors'

const jobTypeToRoute: Record<string, string> = {
  pdb: 'classic',
  crd: 'classic',
  auto: 'auto',
  scoper: 'scoper',
  alphafold: 'alphafold',
  sans: 'sans',
  multi: 'multi'
}

const SingleJobPage = () => {
  useTitle('BilboMD: Job Details')
  const theme = useTheme()
  const token = useSelector(selectCurrentToken)
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const returnParams = location.state?.returnParams ?? ''

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)
  const [tabValue, setTabValue] = useState(0)
  const [deleteJob] = useDeleteJobMutation()

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const handleDeleteJob = async () => {
    // console.log('Deleting job with ID:', id)
    try {
      await deleteJob({ id })
      void navigate('/dashboard/jobs')
    } catch (err) {
      console.error('Failed to delete the job:', err)
    }
  }

  const {
    data: jobData,
    isLoading,
    isError
  } = useGetJobByIdQuery(id ?? skipToken, {
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true
  })

  const job = jobData as BilboMDJobDTO

  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  const {
    data: moviesData,
    error: moviesError,
    isLoading: moviesLoading
  } = useGetMDMoviesQuery(id ?? skipToken)

  const allMoviesReady =
    moviesData &&
    moviesData.movies.length > 0 &&
    moviesData.movies.every((m) => m.status === 'ready')

  // Optionally, use a refetch or polling effect:
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (!allMoviesReady && id) {
      interval = setInterval(() => {
        // You may need to use refetch from RTK Query if available
        // refetchMovies()
      }, 15000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [allMoviesReady, id])

  // Debug logging
  // console.log('moviesData:', moviesData)
  // console.log('moviesError:', moviesError)
  // console.log('moviesLoading:', moviesLoading)

  const getProgressValue = () => {
    if (!job) return 0
    const mongoProg =
      typeof job?.mongo?.progress === 'number' ? job.mongo.progress : NaN
    return isFinite(mongoProg) ? mongoProg : 0
  }

  if (isLoading) {
    return <PulseLoader color={'#ffffff'} />
  }

  if (isError) {
    return (
      <Alert
        severity="warning"
        variant="outlined"
      >
        <AlertTitle>Job Not Found or Deleted</AlertTitle>
        <Typography variant="body2">
          This job could not be loaded. It may have been deleted or expired, or
          there may be a problem communicating with the backend server.
        </Typography>
        <Box mt={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard/jobs')}
          >
            Return to Jobs List
          </Button>
        </Box>
      </Alert>
    )
  }

  if (configIsLoading) return <CircularProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration data</Alert>
  if (!config)
    return <Alert severity="warning">No configuration data available</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'

  const handleDownload = async (id: string) => {
    try {
      const response = await axiosInstance.get(`jobs/${id}/results`, {
        responseType: 'blob',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response && response.data) {
        const contentDisposition = response.headers['content-disposition']
        let filename = 'download.tar.gz' // Default filename if not specified
        if (contentDisposition) {
          const matches = /filename="?([^"]+)"?/.exec(contentDisposition)
          if (matches && matches.length > 1) {
            filename = matches[1]
          }
        }

        const url = window.URL.createObjectURL(response.data)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', filename) // Use dynamic filename
        document.body.appendChild(link)
        link.click()
        link.parentNode?.removeChild(link)
      } else {
        console.error('No data to download')
      }
    } catch (error) {
      console.error('Download results error:', error)
    }
  }

  const statusColors = getStatusColors(
    (job?.mongo.status as JobStatusEnum) || 'Pending',
    theme
  )

  // console.log('job', job)

  const jobTypeRouteSegment = job
    ? jobTypeToRoute[job.mongo.jobType] || 'classic'
    : 'classic'

  const content = job ? (
    <>
      <Grid
        container
        spacing={2}
        rowSpacing={2}
      >
        <Grid size={{ xs: 3, sm: 2, md: 2, lg: 1, xl: 1 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Nav</Typography>
          </HeaderBox>
          <Item sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<KeyboardBackspaceIcon />}
              onClick={() => navigate(`/dashboard/jobs${returnParams}`)}
            >
              Back
            </Button>
          </Item>
        </Grid>

        <Grid size={{ xs: 9, sm: 10, md: 7, lg: 5, xl: 3 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Job Title</Typography>
          </HeaderBox>
          <Item sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h3">{job.mongo.title}</Typography>
          </Item>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2, xl: 2 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Status</Typography>
          </HeaderBox>
          <Item
            sx={{
              backgroundColor: statusColors.background,
              color: statusColors.text
            }}
          >
            <Typography
              variant="h3"
              sx={{ ml: 1 }}
            >
              {job.mongo.status}
            </Typography>
          </Item>
        </Grid>

        <Grid size={{ xs: 6, sm: 8, md: 12, lg: 4, xl: 6 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Progress</Typography>
          </HeaderBox>
          <Item sx={{ display: 'flex', alignItems: 'center' }}>
            <LinearProgress
              variant="determinate"
              value={getProgressValue()}
              sx={{ flexGrow: 1 }}
            />
            <Typography
              variant="h3"
              sx={{ ml: 1 }}
            >
              {getProgressValue().toFixed(0)} %
            </Typography>
          </Item>
        </Grid>

        {/* New BilboMD Steps that uses mongo.steps object */}
        {job.mongo.steps && !useNersc && (
          <Grid
            size={{ xs: 12, sm: 12, md: 6 }}
            sx={{
              flexGrow: 1,
              overflow: 'hidden'
            }}
          >
            <BilboMDMongoSteps steps={job.mongo.steps} />
          </Grid>
        )}

        {/* New BilboMD Steps that uses mongo.steps object for NERSC jobs */}
        {job.mongo.steps && useNersc && (
          <Grid
            size={{ xs: 12, sm: 12, md: 6 }}
            sx={{
              flexGrow: 1,
              overflow: 'hidden'
            }}
          >
            <BilboMDNerscSteps job={job} />
          </Grid>
        )}

        {/* MongoDB Job Details */}
        <Grid
          size={{ xs: 4 }}
          sx={{
            flexGrow: 1,
            overflow: 'hidden'
          }}
        >
          {job.mongo.jobType === 'multi' ? (
            <MultiMDJobDBDetails job={job} />
          ) : (
            <JobDBDetails job={job} />
          )}
        </Grid>

        {/* Analysis Tabs */}
        {job.mongo.status === 'Completed' && id && (
          <>
            <Grid size={{ xs: 12 }}>
              <HeaderBox sx={{ py: '6px' }}>
                <Typography>Analysis</Typography>
              </HeaderBox>

              <Box sx={{ borderBottom: 0, borderColor: 'divider' }}>
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  aria-label="analysis tabs"
                  sx={{
                    backgroundColor: '#e4e4e4ff', // Light gray background for the entire tabs container
                    '& .MuiTab-root': {
                      backgroundColor: '#e0e0e0', // Default tab background
                      color: '#666',

                      '&:hover': {
                        backgroundColor: '#d0d0d0' // Hover state
                      }
                    }
                  }}
                >
                  <Tab label="FoXS Analysis" />
                  <Tab label="MD Movies" />
                  <Tab label="Feedback" />
                </Tabs>
              </Box>

              {tabValue === 0 && (
                <Box sx={{ p: 0 }}>
                  {job.mongo.status === 'Completed' &&
                    (job.mongo.jobType === 'pdb' ||
                      job.mongo.jobType === 'crd' ||
                      job.mongo.jobType === 'auto' ||
                      job.mongo.jobType === 'alphafold') &&
                    id && (
                      <Grid size={{ xs: 12 }}>
                        <Suspense fallback={<CircularProgress />}>
                          <FoXSAnalysis
                            id={id}
                            active={tabValue === 0}
                          />
                        </Suspense>
                      </Grid>
                    )}
                </Box>
              )}
              {tabValue === 1 && (
                <Box sx={{ p: 0 }}>
                  {moviesLoading ? (
                    <CircularProgress />
                  ) : moviesError ? (
                    <Alert severity="error">
                      Error loading movies: {JSON.stringify(moviesError)}
                    </Alert>
                  ) : moviesData ? (
                    <MovieGallery data={moviesData} />
                  ) : (
                    <Alert severity="warning">No movie data available.</Alert>
                  )}
                </Box>
              )}
              {tabValue === 2 && (
                <Box sx={{ p: 0 }}>
                  {job.mongo.status === 'Completed' &&
                    (job.mongo.jobType === 'pdb' ||
                      job.mongo.jobType === 'crd' ||
                      job.mongo.jobType === 'auto' ||
                      job.mongo.jobType === 'alphafold') &&
                    job.mongo.feedback && (
                      <Grid size={{ xs: 12 }}>
                        <BilboMdFeedback feedback={job.mongo.feedback} />
                      </Grid>
                    )}
                </Box>
              )}
            </Grid>
          </>
        )}

        {/* Scoper FoXS Analysis */}
        {job.mongo.status === 'Completed' &&
          job.mongo.jobType === 'scoper' &&
          id && (
            <Grid size={{ xs: 12 }}>
              <HeaderBox sx={{ py: '6px' }}>
                <Typography>Scoper FoXS Analysis</Typography>
              </HeaderBox>
              <ScoperFoXSAnalysis id={id} />
            </Grid>
          )}

        {/* Molstar Viewer */}
        {job.mongo.status === 'Completed' &&
          (job.mongo.jobType === 'pdb' ||
            job.mongo.jobType === 'crd' ||
            job.mongo.jobType === 'auto' ||
            job.mongo.jobType === 'alphafold' ||
            job.mongo.jobType === 'scoper') && (
            <Grid size={{ xs: 12 }}>
              <HeaderBox sx={{ py: '6px' }}>
                <Typography>
                  Molstar Viewer
                  <Box
                    component="span"
                    sx={{ color: 'yellow', fontSize: '0.75em' }}
                  >
                    experimental
                  </Box>
                </Typography>
              </HeaderBox>
              <MolstarViewer job={job} />
            </Grid>
          )}

        {/* Download Results */}
        {job.mongo.status === 'Completed' && (
          <Grid size={{ xs: 12 }}>
            <HeaderBox sx={{ py: '6px' }}>
              <Typography>Results</Typography>
            </HeaderBox>
            <Item>
              <Button
                variant="contained"
                onClick={() => {
                  void handleDownload(job.mongo.id)
                }}
                sx={{ mr: 2 }}
              >
                Download Results
              </Button>

              {(job.mongo.jobType === 'pdb' ||
                job.mongo.jobType === 'crd' ||
                job.mongo.jobType === 'auto') && (
                <Button
                  variant="contained"
                  onClick={() =>
                    navigate(
                      `/dashboard/jobs/${jobTypeRouteSegment}/resubmit/${job.id}`
                    )
                  }
                  sx={{ my: 2, mr: 2 }}
                >
                  Resubmit
                </Button>
              )}

              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setOpenDeleteDialog(true)}
              >
                Delete
              </Button>

              <Typography>
                The{' '}
                <span
                  style={{
                    fontWeight: 'bold',
                    fontFamily: 'Courier, monospace'
                  }}
                >
                  results.tar.gz
                </span>{' '}
                tar archive will contains your original files plus some output
                files from BilboMD.
              </Typography>
            </Item>
          </Grid>
        )}

        {job.mongo.status === 'Error' && (
          <Grid size={{ xs: 12 }}>
            <HeaderBox sx={{ py: '6px' }}>
              <Typography>
                {/* Error - {job.bullmq?.bullmq?.failedReason ?? 'Unknown error'} */}
                Error in SingleJobPage Component
              </Typography>
            </HeaderBox>

            <Item>
              <Alert
                severity="error"
                variant="outlined"
              >
                Hmmmm... Well something didn&apos;t work. Please try submitting
                again and if things still don&apos;t work contact Scott or
                Michal.
              </Alert>
              {/* <JobError job={job} /> */}
            </Item>
          </Grid>
        )}
      </Grid>
    </>
  ) : (
    <>
      <MissingJob id={id} />
    </>
  )

  return (
    <>
      {content}
      <Dialog
        open={openDeleteDialog}
        onClose={() => setOpenDeleteDialog(false)}
      >
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this job? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setOpenDeleteDialog(false)}
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteJob}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default SingleJobPage
