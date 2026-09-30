import { useNavigate } from 'react-router'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Grid,
  Typography
} from '@mui/material'
import type { JobType } from '@bilbomd/bilbomd-types'
import HeaderBox from 'components/HeaderBox'
import MissingJob from 'components/MissingJob'
import Item from 'themes/components/Item'
import { BilboMDScoperTable } from 'features/scoperjob/BilboMDScoperTable'
import ScoperFoXSAnalysis from 'features/scoperjob/ScoperFoXSAnalysis'
import type { JobSource } from './jobSource'
import { isFinishedStatus } from './stepModel'
import { useJobDownload } from './useJobDownload'
import { useJobView } from './useJobView'
import { useNow } from './useNow'
import JobSummaryHeader from './JobSummaryHeader'
import JobProgressCard from './JobProgressCard'
import JobAlerts from './JobAlerts'
import JobAnalysisTabs from './JobAnalysisTabs'
import { analysisTabs } from './jobPageModel'
import JobResultsSection from './JobResultsSection'
import JobInputsSection from './JobInputsSection'
import MolstarSection from './MolstarSection'

const MOLSTAR_JOB_TYPES: JobType[] = [
  'pdb',
  'crd',
  'auto',
  'alphafold',
  'openfold',
  'scoper',
  'sans'
]

const OwnerJobError = () => {
  const navigate = useNavigate()
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
      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={() => void navigate('/dashboard/jobs')}
        >
          Return to Jobs List
        </Button>
      </Box>
    </Alert>
  )
}

const PublicJobError = () => (
  <Alert severity="warning">
    <AlertTitle>Job Not Found</AlertTitle>
    We could not find a job with this link. It may have expired or the URL may
    be incorrect.
  </Alert>
)

const Section = ({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox sx={{ py: '6px' }}>
      <Typography>{title}</Typography>
    </HeaderBox>
    {children}
  </Grid>
)

// One job page for owners (/dashboard/jobs/:id) and public results links
// (/results/:token). Owner-only parts check `source.kind`.
const JobDetailPage = ({ source }: { source: JobSource }) => {
  const { view, isLoading, isError, eventsConnected } = useJobView(source)
  const { download, error, clearError, isDownloading } = useJobDownload(source)
  const now = useNow(view?.status === 'Running')

  if (isLoading) return <CircularProgress />
  if (isError) {
    return source.kind === 'owner' ? <OwnerJobError /> : <PublicJobError />
  }
  if (!view) {
    return source.kind === 'owner' ? (
      <MissingJob id={source.id} />
    ) : (
      <PublicJobError />
    )
  }

  const completed = view.status === 'Completed'
  const onDownload = () => void download()
  const showResults =
    completed || (source.kind === 'owner' && isFinishedStatus(view.status))

  return (
    <Grid
      container
      spacing={2}
      sx={{ mb: 2 }}
    >
      <Grid size={{ xs: 12 }}>
        <JobSummaryHeader
          source={source}
          view={view}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <JobProgressCard
          view={view}
          now={now}
          onDownload={onDownload}
          isDownloading={isDownloading}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <JobInputsSection
          source={source}
          view={view}
        />
      </Grid>

      <JobAlerts view={view} />

      {view.results?.scoper && (
        <Section title="Scoper Summary">
          <Item>
            <BilboMDScoperTable results={view.results.scoper} />
          </Item>
        </Section>
      )}

      {completed && analysisTabs(view.jobType).length > 0 && (
        <Grid size={{ xs: 12 }}>
          <JobAnalysisTabs
            source={source}
            view={view}
            eventsConnected={eventsConnected}
          />
        </Grid>
      )}

      {/* The Scoper FoXS endpoint is owner-only */}
      {completed && view.jobType === 'scoper' && source.kind === 'owner' && (
        <Section title="Scoper FoXS Analysis">
          <ScoperFoXSAnalysis id={source.id} />
        </Section>
      )}

      {completed &&
        view.results &&
        MOLSTAR_JOB_TYPES.includes(view.jobType) && (
          <MolstarSection
            source={source}
            view={view}
          />
        )}

      {showResults && (
        <Grid size={{ xs: 12 }}>
          <JobResultsSection
            source={source}
            view={view}
            onDownload={onDownload}
            isDownloading={isDownloading}
            downloadError={error}
            onClearDownloadError={clearError}
          />
        </Grid>
      )}
    </Grid>
  )
}

export default JobDetailPage
