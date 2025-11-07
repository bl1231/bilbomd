import { useParams } from 'react-router'
import { useState, useEffect } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Typography,
  LinearProgress,
  useTheme
} from '@mui/material'
import useTitle from 'hooks/useTitle'
import { useGetPublicJobByIdQuery } from 'slices/publicJobsApiSlice'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import { getStatusColors } from 'features/shared/StatusColors'
import { JobStatusEnum } from '@bilbomd/mongodb-schema/frontend'
import PublicJobAnalysisSection from 'features/public/PublicJobAnalysisSection'
import PublicMolstarViewer from './PublicMolstarViewer'
import PublicDownloadResultsSection from 'features/public/PublicDownloadResultsSection'

import CopyableChip from 'components/CopyableChip'

const PublicJobPage = () => {
  useTitle('BilboMD: Job Status')
  const theme = useTheme()
  const { publicId } = useParams<{ publicId: string }>()
  const [shouldPoll, setShouldPoll] = useState(true)

  // console.log('PublicJobPage publicId:', publicId)

  const { data, isLoading, isError } = useGetPublicJobByIdQuery(publicId!, {
    skip: !publicId,
    pollingInterval: shouldPoll ? 10000 : 0
  })
  // console.log('PublicJobPage data:', data)

  useEffect(() => {
    if (data?.status) {
      const finalStates = ['completed', 'failed', 'error', 'cancelled']
      const isFinished = finalStates.includes(data.status.toLowerCase())
      setShouldPoll(!isFinished)
    }
  }, [data?.status])

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

  return (
    <Box>
      <Grid
        container
        spacing={2}
        mb={2}
      >
        {/* TOP LEVEL STATUS */}
        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>BilboMD Job Status</Typography>
          </HeaderBox>
          <Item>
            <Typography variant="subtitle1">
              Job type: {job.jobType} | MD Engine: {job.md_engine ?? 'n/a'}
            </Typography>
            <Typography variant="subtitle1">
              Submitted: {job.submittedAt ? formatDate(job.submittedAt) : 'N/A'}
            </Typography>
            <Typography sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '140px' }}>Public Job ID:</span>
              <CopyableChip
                label="Public ID"
                value={job.publicId}
              />
            </Typography>
            <Typography sx={{ my: 2, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '140px' }}>Results Permalink:</span>
              <CopyableChip
                label="Permalink"
                value={`${window.location.origin}/results/${job.publicId}`}
              />
            </Typography>
          </Item>
        </Grid>

        {/* PROGRESS */}
        <Grid size={{ xs: 12 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Progress</Typography>
          </HeaderBox>
          <Item sx={{ display: 'flex', alignItems: 'center' }}>
            <Chip
              label={job.status}
              variant="outlined"
              sx={{
                backgroundColor: statusColors.background,
                color: statusColors.text,
                mr: 2
              }}
            />
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ flexGrow: 1, mr: 2 }}
            />
            <Typography
              variant="h3"
              sx={{ ml: 1 }}
            >
              {progress.toFixed(0)}%
            </Typography>
          </Item>
        </Grid>
        {job.status === 'Completed' && (
          <>
            <PublicJobAnalysisSection job={job} />
            <PublicDownloadResultsSection job={job} />
            <PublicMolstarViewer job={job} />
          </>
        )}
      </Grid>
    </Box>
  )
}

export default PublicJobPage
