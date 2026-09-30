import { lazy, Suspense, useState } from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Tab,
  Tabs,
  Typography
} from '@mui/material'
import HeaderBox from 'components/HeaderBox'
import BilboMdFeedback from 'features/analysis/BilboMdFeedback'
import MovieGallery from 'features/analysis/MovieGallery'
import { sourceProps, type JobSource } from './jobSource'
import type { JobView } from './jobView'
import { analysisTabs, type AnalysisTab } from './jobPageModel'
import { useJobMovies } from './useJobView'

const FoXSAnalysis = lazy(() => import('features/jobs/FoXSAnalysis'))

const TAB_LABELS: Record<AnalysisTab, string> = {
  foxs: 'FoXS Analysis',
  movies: 'MD Movies',
  feedback: 'Feedback'
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
}

const JobAnalysisTabs = ({
  source,
  view,
  eventsConnected
}: JobAnalysisTabsProps) => {
  const tabs = analysisTabs(view.jobType)
  const [tabIndex, setTabIndex] = useState(0)
  const tab = tabs[tabIndex]

  if (!tab) return null

  return (
    <>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Analysis</Typography>
      </HeaderBox>
      <Box sx={{ borderBottom: 0, borderColor: 'divider' }}>
        <Tabs
          value={tabIndex}
          onChange={(_, value: number) => setTabIndex(value)}
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
          {tabs.map((t) => (
            <Tab
              key={t}
              label={TAB_LABELS[t]}
            />
          ))}
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
            <BilboMdFeedback feedback={view.feedback} />
          ) : (
            <BilboMdFeedback publicId={source.token} />
          ))}
      </Box>
    </>
  )
}

export default JobAnalysisTabs
