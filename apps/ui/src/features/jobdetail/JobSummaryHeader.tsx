import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace'
import HeaderBox from 'components/HeaderBox'
import CopyableChip from 'components/CopyableChip'
import Item from 'themes/components/Item'
import { createJobHandler } from 'features/results/handlers/jobHandlerFactory'
import { formatDateSafe } from 'utils/dates'
import type { JobSource } from './jobSource'
import type { JobView } from './jobView'
import { mdEngineLabel } from './jobPageModel'

const DATE_FORMAT = 'MMM d, yyyy HH:mm'

const MetaRow = ({
  label,
  children
}: {
  label: string
  children: ReactNode
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      rowGap: 0.5,
      minWidth: 0
    }}
  >
    <Typography
      component="span"
      sx={{ width: '140px', flexShrink: 0, fontWeight: 'bold' }}
    >
      {label}:
    </Typography>
    {children}
  </Box>
)

const getJobTypeDisplayName = (jobType: string): string => {
  try {
    return createJobHandler(jobType).getJobTypeDisplayName()
  } catch {
    return jobType
  }
}

const BackButton = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const returnParams = (location.state as { returnParams?: string } | null)
    ?.returnParams
  return (
    <Tooltip title="Back to jobs list">
      <IconButton
        aria-label="back to jobs list"
        color="primary"
        onClick={() => void navigate(`/dashboard/jobs${returnParams ?? ''}`)}
      >
        <KeyboardBackspaceIcon />
      </IconButton>
    </Tooltip>
  )
}

const JobSummaryHeader = ({
  source,
  view
}: {
  source: JobSource
  view: JobView
}) => {
  const engine = mdEngineLabel(view)
  return (
    <>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>BilboMD Job</Typography>
      </HeaderBox>
      <Item>
        <Stack spacing={1.5}>
          {(source.kind === 'owner' || view.title) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {source.kind === 'owner' && <BackButton />}
              <Typography
                variant="h3"
                sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
              >
                {view.title}
              </Typography>
            </Box>
          )}
          <MetaRow label="Job Type">
            <Typography component="span">
              {getJobTypeDisplayName(view.jobType)}
            </Typography>
          </MetaRow>
          {engine && (
            <MetaRow label="MD Engine">
              <Typography component="span">{engine}</Typography>
            </MetaRow>
          )}
          <MetaRow label="Submitted">
            <Typography component="span">
              {formatDateSafe(view.submittedAt, DATE_FORMAT, 'N/A')}
            </Typography>
          </MetaRow>
          {view.completedAt && (
            <MetaRow label="Completed">
              <Typography component="span">
                {formatDateSafe(view.completedAt, DATE_FORMAT, 'N/A')}
              </Typography>
            </MetaRow>
          )}
          {source.kind === 'public' && (
            <MetaRow label="Permalink">
              <CopyableChip
                label="Permalink"
                value={`${window.location.origin}/results/${source.token}`}
              />
            </MetaRow>
          )}
        </Stack>
      </Item>
    </>
  )
}

export default JobSummaryHeader
