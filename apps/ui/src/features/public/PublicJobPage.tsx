import { useParams } from 'react-router'
import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  Typography,
  LinearProgress
} from '@mui/material'
import useTitle from 'hooks/useTitle'
import { useGetPublicJobByIdQuery } from 'slices/publicJobsApiSlice'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'

const PublicJobPage = () => {
  const { publicId } = useParams<{ publicId: string }>()
  console.log('PublicJobPage publicId:', publicId)
  useTitle('BilboMD: Job Status')

  const { data, isLoading, isError } = useGetPublicJobByIdQuery(publicId!, {
    skip: !publicId
  })
  console.log('PublicJobPage data:', data)

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
      <Typography
        variant="h4"
        gutterBottom
      >
        BilboMD Job Status
      </Typography>
      <Typography
        variant="subtitle1"
        gutterBottom
      >
        Job type: {job.jobType} | Engine: {job.md_engine ?? 'n/a'}
      </Typography>
      <Typography
        variant="subtitle2"
        gutterBottom
      >
        Public ID: {job.publicId}
      </Typography>

      <Box mt={3}>
        <Typography variant="h6">Status: {job.status}</Typography>
        <Box
          display="flex"
          alignItems="center"
          mt={1}
        >
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ flexGrow: 1, mr: 2 }}
          />
          <Typography>{progress.toFixed(0)}%</Typography>
        </Box>
      </Box>

      {/* Optionally: show ensemble counts if present */}
      {job.classic && (
        <Box mt={3}>
          <Typography>
            Ensembles generated: {job.classic.numEnsembles}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default PublicJobPage
