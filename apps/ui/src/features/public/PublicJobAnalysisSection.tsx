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

interface JobAnalysisSectionProps {
  job: PublicJobStatus
}

const JobAnalysisSection = ({ job }: JobAnalysisSectionProps) => {
  // console.log('JobAnalysisSection job:', job)
  const [tabValue, setTabValue] = useState(0)

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
            <Suspense fallback={<CircularProgress />}>
              <Alert severity="info">
                No MD Movies available for this job.
              </Alert>
            </Suspense>
          </Grid>
        </Box>
      )}
      {tabValue === 2 && (
        <Box sx={{ p: 0 }}>
          <Grid size={{ xs: 12 }}>
            <Suspense fallback={<CircularProgress />}>
              <Alert severity="info">Feedback Content</Alert>
            </Suspense>
          </Grid>
        </Box>
      )}
    </Grid>
  )
}

export default JobAnalysisSection
