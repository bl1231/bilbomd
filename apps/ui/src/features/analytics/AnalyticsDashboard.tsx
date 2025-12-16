import React from 'react'
import { Box, Grid, Typography, Divider } from '@mui/material'
import { KpiCards } from './components/KpiCards'
import { PipelineTrends } from './components/PipelineTrends'
import { FailureRate } from './components/FailureRate'
import { DurationStats } from './components/DurationStats'
import { AccessModeSplit } from './components/AccessModeSplit'
import { grey } from '@mui/material/colors'

export const AnalyticsDashboard: React.FC = () => {
  return (
    <React.Fragment>
      <Box
        sx={{
          backgroundColor: grey[500],
          p: 1,
          m: 0,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottom: 1,
          borderColor: grey[500]
        }}
      >
        <Typography variant="h4">BilboMD Analytics</Typography>
      </Box>
      <Box sx={{ p: 2 }}>
        <Typography
          variant="h4"
          gutterBottom
        >
          Admin Analytics
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          gutterBottom
        >
          Overview of BilboMD pipelines: usage, success rates, durations, and
          access-mode split.
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Grid
          container
          spacing={2}
        >
          <Grid size={{ xs: 12 }}>
            <KpiCards />
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <PipelineTrends />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <FailureRate />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <DurationStats />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <AccessModeSplit />
          </Grid>
        </Grid>
      </Box>
    </React.Fragment>
  )
}

export default AnalyticsDashboard
