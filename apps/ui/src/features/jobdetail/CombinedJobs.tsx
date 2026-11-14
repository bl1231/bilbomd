import { Box, Chip, Link, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Link as RouterLink } from 'react-router'
import type { MultiCombinedJobDTO } from '@bilbomd/bilbomd-types'
import CopyableChip from 'components/CopyableChip'
import { getStatusColors } from 'features/shared/StatusColors'
import { createJobHandler } from 'features/results/handlers/jobHandlerFactory'

const jobTypeName = (jobType?: string): string | undefined => {
  if (!jobType) return undefined
  try {
    return createJobHandler(jobType).getJobTypeDisplayName()
  } catch {
    return jobType
  }
}

const CombinedJob = ({
  job,
  isDataSource
}: {
  job: MultiCombinedJobDTO
  isDataSource: boolean
}) => {
  const theme = useTheme()
  const status = job.status ? getStatusColors(job.status, theme) : undefined
  const details = [
    jobTypeName(job.jobType),
    job.md_engine,
    typeof job.conformations === 'number'
      ? `${job.conformations.toLocaleString()} conformations`
      : undefined
  ].filter(Boolean)

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        '&:first-of-type': { borderTop: 0 }
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        {job.id ? (
          <Link
            component={RouterLink}
            to={`/dashboard/jobs/${job.id}`}
            sx={{ fontWeight: 'bold', overflowWrap: 'anywhere' }}
          >
            {job.title || job.uuid}
          </Link>
        ) : (
          <Typography sx={{ fontStyle: 'italic' }}>
            Job no longer available
          </Typography>
        )}
        {status && (
          <Chip
            label={job.status}
            size="small"
            sx={{ backgroundColor: status.background, color: status.text }}
          />
        )}
        {isDataSource && (
          <Chip
            label="SAXS data used"
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
      </Stack>
      {details.length > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.25 }}
        >
          {details.join(' · ')}
        </Typography>
      )}
      <Box sx={{ mt: 0.5 }}>
        <CopyableChip
          label="UUID"
          value={job.uuid}
        />
      </Box>
    </Box>
  )
}

// The runs a Multi job pooled for MultiFoXS. `jobs` comes from the backend;
// an older backend sends only the uuids, which are shown on their own.
const CombinedJobs = ({
  jobs,
  uuids,
  dataFileFrom
}: {
  jobs?: MultiCombinedJobDTO[]
  uuids: string[]
  dataFileFrom?: string
}) => {
  const list = jobs ?? uuids.map((uuid) => ({ uuid }))
  if (list.length === 0) return null
  return (
    <Box>
      <Typography sx={{ fontWeight: 'bold' }}>Combined runs:</Typography>
      <Box
        component="ul"
        aria-label="Combined runs"
        sx={{ m: 0, p: 0 }}
      >
        {list.map((job) => (
          <CombinedJob
            key={job.uuid}
            job={job}
            isDataSource={job.uuid === dataFileFrom}
          />
        ))}
      </Box>
    </Box>
  )
}

export default CombinedJobs
