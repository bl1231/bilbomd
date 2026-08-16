import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import ScheduleIcon from '@mui/icons-material/Schedule'
import BlockIcon from '@mui/icons-material/Block'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import { Link, useLocation } from 'react-router'
import { formatRelativeDateSafe } from 'utils/dates'

const PAGE_SIZE = 20

export interface JobCardRow {
  id: string
  title: string
  status?: string
  jobType?: string
  md_engine?: string
  time_submitted?: Date
  progress?: number | null
  username?: string
  totalRuntime?: string
  pipelineName?: string
}

interface JobCardListProps {
  rows: JobCardRow[]
  showUsername: boolean
}

const statusIcons: Record<string, React.ReactNode> = {
  Completed: <CheckCircleOutlineIcon fontSize='inherit' />,
  Error: <ErrorOutlineIcon fontSize='inherit' />,
  Failed: <ErrorOutlineIcon fontSize='inherit' />,
  Running: <AutorenewIcon fontSize='inherit' />,
  Submitted: <ScheduleIcon fontSize='inherit' />,
  Pending: <ScheduleIcon fontSize='inherit' />,
  Cancelled: <BlockIcon fontSize='inherit' />,
  Unknown: <HelpOutlineIcon fontSize='inherit' />
}

// Active jobs first (the ones worth checking on a phone), then most recent
const statusRank = (status?: string) => {
  if (status === 'Running') return 0
  if (status === 'Pending' || status === 'Submitted') return 1
  return 2
}

const JobCardList = ({ rows, showUsername }: JobCardListProps) => {
  const theme = useTheme()
  const location = useLocation()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const sorted = [...rows].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    if (rankDiff !== 0) return rankDiff
    const aTime = a.time_submitted ? new Date(a.time_submitted).getTime() : 0
    const bTime = b.time_submitted ? new Date(b.time_submitted).getTime() : 0
    return bTime - aTime
  })

  const visible = sorted.slice(0, visibleCount)
  const remaining = sorted.length - visible.length

  const statusColor = (status?: string) => {
    const colors = theme.palette.bilbomdStatus
    const byStatus: Record<string, string> = {
      Completed: colors.completed,
      Error: colors.error,
      Running: colors.running,
      Submitted: colors.submitted,
      Pending: colors.pending,
      Failed: colors.failed,
      Cancelled: colors.cancelled
    }
    return byStatus[status ?? ''] ?? colors.unknown
  }

  return (
    <Stack
      spacing={1.5}
      sx={{ mt: 1 }}
    >
      {visible.map((row) => {
        const isRunning = row.status === 'Running'
        const progressValue = Number(row.progress)
        const displayProgress = Number.isNaN(progressValue) ? 0 : progressValue
        const metadata = [
          row.pipelineName ?? row.jobType,
          row.md_engine,
          isRunning
            ? row.totalRuntime
            : formatRelativeDateSafe(row.time_submitted),
          showUsername ? row.username : null
        ].filter(Boolean)

        return (
          <Paper
            key={row.id}
            component={Link}
            to={`/dashboard/jobs/${row.id}`}
            state={{ returnParams: location.search }}
            variant='outlined'
            sx={{
              display: 'block',
              p: 1.5,
              borderLeft: `5px solid ${statusColor(row.status)}`,
              textDecoration: 'none',
              color: 'inherit',
              '&:active': { backgroundColor: theme.palette.action.selected }
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 0.5
              }}
            >
              <Chip
                size='small'
                icon={
                  <Box
                    component='span'
                    sx={{ display: 'inline-flex', fontSize: '1rem', ml: 0.5 }}
                  >
                    {statusIcons[row.status ?? 'Unknown'] ??
                      statusIcons.Unknown}
                  </Box>
                }
                label={row.status ?? 'Unknown'}
                sx={{
                  backgroundColor: statusColor(row.status),
                  color: theme.palette.getContrastText(
                    statusColor(row.status)
                  ),
                  fontWeight: 600
                }}
              />
              {!isRunning && row.totalRuntime && (
                <Typography
                  variant='caption'
                  color='text.secondary'
                >
                  ran {row.totalRuntime}
                </Typography>
              )}
            </Box>
            <Typography
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {row.title}
            </Typography>
            <Typography
              variant='body2'
              color='text.secondary'
              noWrap
            >
              {metadata.join(' · ')}
            </Typography>
            {isRunning && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <LinearProgress
                  variant='determinate'
                  value={displayProgress}
                  sx={{ flexGrow: 1, mr: 1 }}
                />
                <Typography variant='body2'>{displayProgress}%</Typography>
              </Box>
            )}
          </Paper>
        )
      })}

      {remaining > 0 && (
        <Button
          variant='outlined'
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          Load {Math.min(remaining, PAGE_SIZE)} more ({remaining} remaining)
        </Button>
      )}
    </Stack>
  )
}

export default JobCardList
