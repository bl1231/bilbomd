import { Typography, Box, Chip, Alert, AlertTitle } from '@mui/material'
import Grid from '@mui/material/Grid'
import Divider from '@mui/material/Divider'
import { useGetQueueStateQuery } from 'features/bullmq/bullmqApiSlice'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'

interface QueueCounts {
  active_count: number
  waiting_count: number
  worker_count: number
}

interface QueueStatus {
  bilbomd: QueueCounts
  scoper: QueueCounts
}

const statChipSx = {
  mx: { xs: 0.5, sm: 1 },
  backgroundColor: '#262626',
  color: '#bae637',
  fontSize: { xs: '1.2em', sm: '1.6em' },
  fontWeight: 'bold',
  '& .MuiChip-label': { px: { xs: 1, sm: 1.5 } }
}

const QueueStatsRow = ({ counts }: { counts: QueueCounts }) => {
  const stats: { label: string; count: number }[] = [
    { label: 'Active', count: counts.active_count },
    { label: 'Queued', count: counts.waiting_count },
    { label: 'Workers', count: counts.worker_count }
  ]
  return (
    <Grid
      sx={{
        m: 1,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 1
      }}
    >
      {stats.map(({ label, count }, index) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            alignItems: 'center',
            ml: index === 0 ? 0 : { xs: 1, sm: 4 }
          }}
        >
          <Typography>
            {label === 'Active' ? <b>Active</b> : label}:
          </Typography>
          <Chip label={count} sx={statChipSx} />
        </Box>
      ))}
    </Grid>
  )
}

const BullMQSummary = () => {
  const {
    data: queueStatus,

    isSuccess,
    isError,
    error
  } = useGetQueueStateQuery('queueList', {
    pollingInterval: 60000,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true
  }) as {
    data: QueueStatus | undefined
    isLoading: boolean
    isSuccess: boolean
    isError: boolean
    error: Error
  }

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <HeaderBox>
        <Typography>BullMQ Status</Typography>
      </HeaderBox>

      <Item sx={{ p: 1 }}>
        {isError && (
          <Alert severity='error' variant='outlined' sx={{ mb: 2 }}>
            <AlertTitle>Error</AlertTitle>
            <Typography variant='body2'>
              Failed to load BullMQ Queue Status from the backend.
            </Typography>
            {'status' in error && (
              <Typography variant='caption' sx={{ fontStyle: 'italic' }}>
                {`Status ${error.status}: ${
                  'data' in error
                    ? JSON.stringify(error.data)
                    : 'No additional details'
                }`}
              </Typography>
            )}
            {!('status' in error) && error?.message && (
              <Typography variant='caption' sx={{ fontStyle: 'italic' }}>
                Details: {error.message}
              </Typography>
            )}
          </Alert>
        )}

        {isSuccess && queueStatus && (
          <Grid container spacing={2} sx={{ display: 'flex' }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Divider textAlign='left' variant='fullWidth'>
                <Chip label='BilboMD Queue' />
              </Divider>
              <QueueStatsRow counts={queueStatus.bilbomd} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Divider textAlign='left' variant='fullWidth'>
                <Chip label='Scoper Queue' />
              </Divider>
              <QueueStatsRow counts={queueStatus.scoper} />
            </Grid>
          </Grid>
        )}
      </Item>
    </Box>
  )

  return content
}

export default BullMQSummary
