import React from 'react'
import {
  Card,
  CardContent,
  Grid,
  Typography,
  Skeleton,
  Box,
  Chip,
  Stack
} from '@mui/material'
import { useGetSummaryQuery } from '../../../slices/analyticsApiSlice'

const StatCard: React.FC<{
  label: string
  value?: number
  loading?: boolean
}> = ({ label, value, loading }) => (
  <Card variant="outlined">
    <CardContent>
      <Typography
        variant="subtitle2"
        color="text.secondary"
      >
        {label}
      </Typography>
      {loading ? (
        <Skeleton
          variant="text"
          width={80}
        />
      ) : (
        <Typography variant="h5">{value ?? 0}</Typography>
      )}
    </CardContent>
  </Card>
)

export const KpiCards: React.FC = () => {
  const { data, isLoading } = useGetSummaryQuery()

  const usageChips = (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: 'wrap' }}
    >
      {data?.usagePerPipeline?.map((u) => (
        <Chip
          key={u.pipeline}
          label={`${u.pipeline}: ${u.count}`}
          size="small"
        />
      ))}
    </Stack>
  )

  return (
    <Box>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="Users"
            value={data?.users}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="Jobs"
            value={data?.jobs}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="MultiJobs"
            value={data?.multijobs}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="Completed"
            value={data?.jobsCompleted}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="Failed"
            value={data?.jobsFailed}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <StatCard
            label="Total Submitted (all-time)"
            value={data?.totalJobsSubmitted}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Usage per pipeline
              </Typography>
              {isLoading ? (
                <Skeleton
                  variant="rectangular"
                  height={36}
                />
              ) : (
                usageChips
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default KpiCards
