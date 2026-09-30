import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Typography,
  useTheme
} from '@mui/material'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import { getStatusColors } from 'features/shared/StatusColors'
import type { JobView } from './jobView'
import { durationBackground } from './jobPageModel'
import { formatDuration, jobDurationMs, runningStep } from './stepModel'
import StepStrip from './StepStrip'

type JobProgressCardProps = {
  view: JobView
  now: Date
  onDownload: () => void
  isDownloading: boolean
}

const JobProgressCard = ({
  view,
  now,
  onDownload,
  isDownloading
}: JobProgressCardProps) => {
  const theme = useTheme()
  const statusColors = getStatusColors(view.status, theme)
  const running = runningStep(view.steps)
  const durationMs = jobDurationMs(view, now)

  return (
    <>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Progress</Typography>
      </HeaderBox>
      <Item sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 1
          }}
        >
          <Chip
            label={view.status}
            variant="outlined"
            sx={{
              backgroundColor: statusColors.background,
              color: statusColors.text,
              mr: 2
            }}
          />
          {durationMs !== undefined && (
            <Chip
              label={`⏱ ${formatDuration(durationMs)}`}
              variant="outlined"
              sx={{
                mr: 2,
                backgroundColor: durationBackground(view.status, theme)
              }}
            />
          )}
          <LinearProgress
            variant="determinate"
            value={view.progress}
            aria-label="job progress"
            sx={{ flexGrow: 1, mr: 2, minWidth: 120 }}
          />
          <Typography
            variant="h3"
            sx={{ mx: 1 }}
          >
            {view.progress.toFixed(0)}%
          </Typography>
          {view.status === 'Completed' && (
            <Button
              variant="contained"
              onClick={onDownload}
              disabled={isDownloading || view.resultsReady === false}
              sx={{ mr: 2 }}
            >
              Download Results
            </Button>
          )}
        </Box>
        {running?.message && (
          <Typography
            variant="subtitle1"
            sx={{ color: 'text.secondary', pl: 1 }}
          >
            {running.message}
          </Typography>
        )}
        <StepStrip
          steps={view.steps}
          jobType={view.jobType}
          now={now}
        />
      </Item>
    </>
  )
}

export default JobProgressCard
