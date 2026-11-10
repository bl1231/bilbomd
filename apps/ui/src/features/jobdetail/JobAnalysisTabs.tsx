import { lazy, Suspense, useState } from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Tab,
  Tabs,
  Typography
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import HeaderBox from 'components/HeaderBox'
import BilboMdFeedback from 'features/analysis/BilboMdFeedback'
import MovieGallery from 'features/analysis/MovieGallery'
import { feedbackAttention } from 'features/analysis/feedbackModel'
import { sourceProps, type JobSource } from './jobSource'
import type { JobView } from './jobView'
import {
  ANALYSIS_HEADING_ID,
  analysisTabs,
  type AnalysisTab
} from './jobPageModel'
import { useJobMovies } from './useJobView'
import { useJobFeedback } from './useJobFeedback'
import PaeTab from './PaeTab'
import RigidDomainsTab from './RigidDomainsTab'

const FoXSAnalysis = lazy(() => import('features/jobs/FoXSAnalysis'))

const TAB_LABELS: Record<AnalysisTab, string> = {
  foxs: 'FoXS Analysis',
  movies: 'MD Movies',
  feedback: 'Feedback & Validation',
  pae: 'PAE',
  domains: 'Rigid Domains'
}

const MoviesTab = ({
  source,
  eventsConnected
}: {
  source: JobSource
  eventsConnected: boolean
}) => {
  const { data, isLoading, error } = useJobMovies(source, eventsConnected)
  if (isLoading) return <CircularProgress />
  if (error) return <Alert severity="error">Error loading movies.</Alert>
  if (!data) return <Alert severity="warning">No movie data available.</Alert>
  return <MovieGallery data={data} />
}

type JobAnalysisTabsProps = {
  source: JobSource
  view: JobView
  eventsConnected: boolean
  // Set by the page to open a particular tab (the mismatch banner's button).
  // Left undefined, the tabs keep their own selection.
  activeTab?: AnalysisTab
  onTabChange?: (tab: AnalysisTab) => void
}

const JobAnalysisTabs = ({
  source,
  view,
  eventsConnected,
  activeTab,
  onTabChange
}: JobAnalysisTabsProps) => {
  const tabs = analysisTabs(view.jobType)
  const [ownTab, setOwnTab] = useState<AnalysisTab | undefined>(tabs[0])
  const requested = activeTab ?? ownTab
  const tab = requested && tabs.includes(requested) ? requested : tabs[0]
  // Mark the tab when the assessment found something worth a look
  const attention = feedbackAttention(useJobFeedback(source, view))

  if (!tab) return null

  const selectTab = (next: AnalysisTab) => {
    setOwnTab(next)
    onTabChange?.(next)
  }

  return (
    <>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography id={ANALYSIS_HEADING_ID}>Analysis</Typography>
      </HeaderBox>
      <Box sx={{ borderBottom: 0, borderColor: 'divider' }}>
        <Tabs
          value={tabs.indexOf(tab)}
          onChange={(_, value: number) => {
            const next = tabs[value]
            if (next) selectTab(next)
          }}
          aria-label="analysis tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            backgroundColor: '#e4e4e4ff',
            '& .MuiTab-root': {
              backgroundColor: '#e0e0e0',
              color: '#666',
              '&:hover': {
                backgroundColor: '#d0d0d0'
              }
            }
          }}
        >
          {tabs.map((t) =>
            t === 'feedback' && attention ? (
              <Tab
                key={t}
                label={TAB_LABELS[t]}
                aria-label={`${TAB_LABELS[t]} (needs attention)`}
                icon={
                  <WarningAmberIcon
                    fontSize="small"
                    color={attention === 'problem' ? 'error' : 'warning'}
                  />
                }
                iconPosition="end"
                sx={{ minHeight: 48 }}
              />
            ) : (
              <Tab
                key={t}
                label={TAB_LABELS[t]}
              />
            )
          )}
        </Tabs>
      </Box>
      <Box sx={{ p: 0 }}>
        {tab === 'foxs' && (
          <Suspense fallback={<CircularProgress />}>
            <FoXSAnalysis
              id={source.kind === 'owner' ? source.id : undefined}
              {...sourceProps(source)}
              active
            />
          </Suspense>
        )}
        {tab === 'movies' && (
          <MoviesTab
            source={source}
            eventsConnected={eventsConnected}
          />
        )}
        {tab === 'feedback' &&
          (source.kind === 'owner' ? (
            <BilboMdFeedback
              feedback={view.feedback}
              id={source.id}
            />
          ) : (
            <BilboMdFeedback publicId={source.token} />
          ))}
        {tab === 'pae' && <PaeTab source={source} />}
        {tab === 'domains' && <RigidDomainsTab source={source} />}
      </Box>
    </>
  )
}

export default JobAnalysisTabs
