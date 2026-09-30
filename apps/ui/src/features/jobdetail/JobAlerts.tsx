import { Alert, AlertTitle, Box, Grid, Typography } from '@mui/material'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import type { JobView } from './jobView'
import { erroredStepMessage, isCpuFallback } from './stepModel'

const isFailed = (status: string) => status === 'Error' || status === 'Failed'

// CPU-fallback notice and the Job Failed panel. Returns grid items so the
// page can drop them straight into its layout.
const JobAlerts = ({ view }: { view: JobView }) => {
  const errorMessage = erroredStepMessage(view.steps)
  return (
    <>
      {isCpuFallback(view.steps) && (
        <Grid size={{ xs: 12 }}>
          <Alert
            severity="warning"
            variant="outlined"
          >
            <AlertTitle>MD ran on CPU</AlertTitle>
            CUDA was unavailable on this server, so your molecular dynamics
            simulation ran on CPU instead of GPU. Results are correct, but the
            job may have taken significantly longer than usual.
          </Alert>
        </Grid>
      )}

      {isFailed(view.status) && (
        <Grid size={{ xs: 12 }}>
          <HeaderBox sx={{ py: '6px' }}>
            <Typography>Job Failed</Typography>
          </HeaderBox>
          <Item>
            <Alert
              severity="error"
              variant="outlined"
            >
              <AlertTitle>Job Failed</AlertTitle>
              <Box
                component="pre"
                sx={{
                  mt: 0,
                  mb: 1,
                  fontSize: '0.82em',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {errorMessage ?? 'An unexpected error occurred.'}
              </Box>
              Please contact Scott or Michal and reference your job ID for
              faster support:{' '}
              <Box
                component="code"
                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
              >
                {view.uuid}
              </Box>
            </Alert>
          </Item>
        </Grid>
      )}
    </>
  )
}

export default JobAlerts
