import { useParams, Link } from 'react-router'
import { useState, useEffect, lazy, Suspense } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Typography,
  LinearProgress,
  useTheme,
  Button
} from '@mui/material'
import useTitle from 'hooks/useTitle'
import { useGetPublicJobByIdQuery } from 'slices/publicJobsApiSlice'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import { getStatusColors } from 'features/shared/StatusColors'
import { getStepDetails } from 'features/shared/stepDetails'
import DirectionsRunRoundedIcon from '@mui/icons-material/DirectionsRunRounded'
import Tooltip from '@mui/material/Tooltip'
import { JobStatusEnum } from '@bilbomd/mongodb-schema/frontend'
import PublicJobAnalysisSection from 'features/public/PublicJobAnalysisSection'
const MolstarViewer = lazy(() => import('features/molstar/Viewer'))
import PublicDownloadResultsSection from 'features/public/PublicDownloadResultsSection'

import CopyableChip from 'components/CopyableChip'
import { BilboMDScoperTable } from 'features/scoperjob/BilboMDScoperTable'
import { axiosInstance } from 'app/api/axios'
import { createJobHandler } from 'features/results/handlers/jobHandlerFactory'

const getJobTypeDisplayName = (jobType: string): string => {
  try {
    return createJobHandler(jobType).getJobTypeDisplayName()
  } catch {
    return jobType
  }
}

const handleDownload = async (publicId: string) => {
  try {
    const response = await axiosInstance.get(
      `/public/jobs/${publicId}/results`,
      {
        responseType: 'blob'
      }
    )

    if (response && response.data) {
      const contentDisposition = response.headers['content-disposition'] as
        | string
        | undefined
      let filename = 'results.tar.gz'

      if (contentDisposition) {
        const matches = /filename="?([^"]+)"?/.exec(contentDisposition)
        if (matches && matches.length > 1) {
          filename = matches[1]
        }
      }

      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
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

const PublicJobPage = () => {
  useTitle('BilboMD: Job Status')
  const theme = useTheme()
  const { publicId } = useParams<{ publicId: string }>()
  const [shouldPoll, setShouldPoll] = useState(true)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  // console.log('PublicJobPage publicId:', publicId)

  const { data, isLoading, isError } = useGetPublicJobByIdQuery(publicId!, {
    skip: !publicId,
    pollingInterval: shouldPoll ? 10000 : 0
  })
  console.log('PublicJobPage data:', data)

  useEffect(() => {
    if (data?.status) {
      const finalStates = ['completed', 'failed', 'error', 'cancelled']
      const isFinished = finalStates.includes(data.status.toLowerCase())
      setShouldPoll(!isFinished)
    }
  }, [data?.status])

  // Compute running state early and set up timer effect before any returns
  const isJobRunning =
    data?.status === 'Running' && !!data?.startedAt && !data?.completedAt

  useEffect(() => {
    if (!isJobRunning) return
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [isJobRunning])

  const statusColors = getStatusColors(
    (data?.status as JobStatusEnum) || 'Pending',
    theme
  )

  const formatDate = (isoString: string | Date) => {
    const date = new Date(isoString)
    const day = date.toLocaleDateString('en-US', { weekday: 'long' })
    const month = date.toLocaleDateString('en-US', { month: 'long' })
    const dayNum = date.getDate()
    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }
    const year = date.getFullYear()
    const time = date.toLocaleTimeString('en-US', { hour12: false })
    return `${day} ${month} ${ordinal(dayNum)} ${year} ${time}`
  }

  if (!publicId) {
    return (
      <Alert severity="error">
        <AlertTitle>Missing job id</AlertTitle>
        No public job id was provided in the URL.
      </Alert>
    )
  }

  if (isLoading) return <CircularProgress />
  if (isError || !data) {
    return (
      <Alert severity="warning">
        <AlertTitle>Job Not Found</AlertTitle>
        We could not find a job with this link. It may have expired or the URL
        may be incorrect.
      </Alert>
    )
  }

  const job: PublicJobStatus = data
  const progress = job.progress ?? 0

  const runningStepName = job.steps
    ? (Object.entries(job.steps).find(
        ([, step]) =>
          step && typeof step === 'object' && step.status === 'Running'
      )?.[0] ?? null)
    : null

  const latestStepMessage =
    runningStepName && job.steps
      ? (job.steps[runningStepName as keyof typeof job.steps]?.message ?? '')
      : ''

  const erroredStepMessage = job.steps
    ? (Object.values(job.steps).find(
        (step) => step != null && step.status === 'Error'
      )?.message ?? null)
    : null

  const calculateDuration = (): string | undefined => {
    if (!job.startedAt) return undefined
    const startTime = new Date(job.startedAt)
    const endTime = job.completedAt
      ? new Date(job.completedAt)
      : isJobRunning
        ? currentTime
        : new Date()
    const durationMs = endTime.getTime() - startTime.getTime()
    const durationSeconds = Math.floor(durationMs / 1000)
    const hours = Math.floor(durationSeconds / 3600)
    const minutes = Math.floor((durationSeconds % 3600) / 60)
    const seconds = durationSeconds % 60
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  return (
    <Box>
      <Grid
        container
        spacing={2}
        sx={{ mb: 2 }}
      >
        {/* TOP LEVEL STATUS */}
        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>BilboMD Job Status</Typography>
          </HeaderBox>
          <Item>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
              <Chip
                label={`Job Type: ${getJobTypeDisplayName(job.jobType)}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`MD Engine: ${job.md_engine ?? 'n/a'}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Submitted: ${job.submittedAt ? formatDate(job.submittedAt) : 'N/A'}`}
                size="small"
                variant="outlined"
              />
            </Box>
            <Box sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '140px' }}>Public Job ID:</span>
              <CopyableChip
                label="Public ID"
                value={job.publicId}
              />
            </Box>
            <Box sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '140px' }}>Results Permalink:</span>
              <CopyableChip
                label="Permalink"
                value={`${window.location.origin}/results/${job.publicId}`}
              />
            </Box>
          </Item>
        </Grid>

        {/* PROGRESS */}
        <Grid size={{ xs: 12 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Progress</Typography>
          </HeaderBox>
          <Item sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Chip
                label={job.status}
                variant="outlined"
                sx={{
                  backgroundColor: statusColors.background,
                  color: statusColors.text,
                  mr: 2
                }}
              />
              {runningStepName && (
                <Tooltip
                  title={getStepDetails(runningStepName).tooltipMessage}
                  arrow
                >
                  <Chip
                    icon={
                      <DirectionsRunRoundedIcon style={{ color: 'black' }} />
                    }
                    variant="outlined"
                    label={getStepDetails(runningStepName).friendlyName}
                    sx={{
                      backgroundColor: '#fff566',
                      color: 'black',
                      mr: 2
                    }}
                  />
                </Tooltip>
              )}
              {/* Live job timer */}
              {calculateDuration() && (
                <Chip
                  label={`⏱ ${calculateDuration()}`}
                  variant="outlined"
                  sx={{
                    mr: 2,
                    backgroundColor:
                      job.status === 'Running' || job.status === 'Completed'
                        ? '#e8f5e9'
                        : job.status === 'Error' || job.status === 'Failed'
                          ? '#ffebee'
                          : undefined
                  }}
                />
              )}
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ flexGrow: 1, mr: 2 }}
              />
              <Typography
                variant="h3"
                sx={{ mx: 1 }}
              >
                {progress.toFixed(0)}%
              </Typography>
              {job.status === 'Completed' && (
                <Button
                  variant="contained"
                  onClick={() => {
                    void handleDownload(job.publicId)
                  }}
                  sx={{ mr: 2 }}
                >
                  Download Results
                </Button>
              )}
            </Box>
            {latestStepMessage && (
              <Typography
                variant="subtitle1"
                sx={{ color: 'text.secondary', pl: 1 }}
              >
                {latestStepMessage}
              </Typography>
            )}
          </Item>
        </Grid>

        {/* CREATE ACCOUNT ADVISORY */}
        {(job.status === 'Error' || job.status === 'Failed') && (
          <Grid size={{ xs: 12 }}>
            <Alert
              severity="info"
              variant="outlined"
              sx={{ backgroundColor: 'rgba(30, 136, 229, 0.08)' }}
              action={
                <Button
                  component={Link}
                  to="/register"
                  color="primary"
                  size="small"
                  variant="contained"
                >
                  Register
                </Button>
              }
            >
              <AlertTitle>Get personalized support</AlertTitle>
              Creating a free BilboMD account allows the BilboMD team to see
              your failed jobs, diagnose whether this is a bug on our end or an
              issue with your inputs (PDB file or SAXS data), and notify you
              directly.
            </Alert>
          </Grid>
        )}

        {/* ERROR / FAILED */}
        {(job.status === 'Error' || job.status === 'Failed') && (
          <Grid size={{ xs: 12 }}>
            <HeaderBox sx={{ py: '6px' }}>
              <Typography>Job Failed</Typography>
            </HeaderBox>
            <Item>
              <Alert
                severity="error"
                variant="outlined"
              >
                <AlertTitle>Something went wrong</AlertTitle>
                {erroredStepMessage
                  ? erroredStepMessage
                  : 'An unexpected error occurred. Please try resubmitting or creating a BilboMD account for support.'}
              </Alert>
            </Item>
          </Grid>
        )}

        {/* SCOPER RESULTS SUMMARY */}
        {job.results?.scoper && (
          <Grid size={{ xs: 12 }}>
            <HeaderBox sx={{ py: '6px' }}>
              <Typography>Scoper Summary</Typography>
            </HeaderBox>
            <Item>
              <BilboMDScoperTable results={job.results.scoper} />
            </Item>
          </Grid>
        )}

        {/* ANALYSIS SECTION */}
        {job.status === 'Completed' && <PublicJobAnalysisSection job={job} />}

        {/* Molstar Viewer */}
        {job.status === 'Completed' && job.results && (
          <Grid size={{ xs: 12 }}>
            <HeaderBox sx={{ py: '6px' }}>
              <Typography>
                Molstar Viewer
                <Box
                  component="span"
                  sx={{ ml: 1, color: 'yellow', fontSize: '0.75em' }}
                >
                  experimental
                </Box>
              </Typography>
            </HeaderBox>
            <Suspense fallback={<CircularProgress />}>
              <MolstarViewer
                id={job.jobId}
                jobType={job.jobType}
                results={job.results}
                isPublic={true}
                publicId={job.publicId}
                constraints={job.md_constraints}
              />
            </Suspense>
          </Grid>
        )}

        {/* Download Results */}
        {job.status === 'Completed' && (
          <PublicDownloadResultsSection job={job} />
        )}
      </Grid>
    </Box>
  )
}

export default PublicJobPage
