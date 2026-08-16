import { useState, Suspense } from 'react'
import {
  Box,
  Grid,
  Tab,
  Tabs,
  Typography,
  CircularProgress,
  Alert
} from '@mui/material'
import HeaderBox from 'components/HeaderBox'
import FoXSAnalysis from 'features/jobs/FoXSAnalysis'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'
import BilboMdFeedback from 'features/analysis/BilboMdFeedback'
import MovieGallery from 'features/analysis/MovieGallery'
import { useGetPublicMDMoviesQuery } from 'slices/publicJobsApiSlice'

interface JobAnalysisSectionProps {
  job: PublicJobStatus
}

const JobAnalysisSection = ({ job }: JobAnalysisSectionProps) => {
  const [tabValue, setTabValue] = useState(0)

  const {
    data: moviesData,
    error: moviesError,
    isLoading: moviesLoading
  } = useGetPublicMDMoviesQuery(job.publicId)

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  return (
    <Grid size={{ xs: 12, sm: 12, md: 12, lg: 12, xl: 12 }}>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Analysis</Typography>
      </HeaderBox>
      <Box sx={{ borderBottom: 0, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
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
          <Tab label="FoXS Analysis" />
          <Tab label="MD Movies" />
          <Tab label="Feedback" />
        </Tabs>
      </Box>
      {tabValue === 0 && (
        <Box sx={{ p: 0 }}>
          <Grid size={{ xs: 12 }}>
            <Suspense fallback={<CircularProgress />}>
              <FoXSAnalysis
                id=""
                publicId={job.publicId}
                isPublic={true}
                active={tabValue === 0}
              />
            </Suspense>
          </Grid>
        </Box>
      )}
      {tabValue === 1 && (
        <Box sx={{ p: 0 }}>
          <Grid size={{ xs: 12 }}>
            {moviesLoading ? (
              <CircularProgress />
            ) : moviesError ? (
              <Alert severity="error">Error loading movies.</Alert>
            ) : moviesData ? (
              <MovieGallery data={moviesData} />
            ) : (
              <Alert severity="warning">No movie data available.</Alert>
            )}
          </Grid>
        </Box>
      )}
      {tabValue === 2 && (
        <Box sx={{ p: 0 }}>
          <Grid size={{ xs: 12 }}>
            <Suspense fallback={<CircularProgress />}>
              <BilboMdFeedback publicId={job.publicId} />
            </Suspense>
          </Grid>
        </Box>
      )}
    </Grid>
  )
}

export default JobAnalysisSection
