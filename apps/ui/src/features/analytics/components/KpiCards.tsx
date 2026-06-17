import React from 'react'
import {
  Card,
  CardContent,
  Grid,
  Typography,
  Skeleton,
  Box,
  LinearProgress
} from '@mui/material'
import {
  useGetSummaryQuery,
  useGetJobsByStatusQuery
} from '../../../slices/analyticsApiSlice'
import { BreakdownCard } from './BreakdownCard'

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
  const { data: byStatus, isLoading: statusLoading } = useGetJobsByStatusQuery()

  const usageItems =
    data?.usagePerPipeline?.map((u) => ({
      label: u.pipeline,
      value: u.count
    })) ?? []

  const statusItems =
    byStatus?.map((s) => ({ label: s.status, value: s.count })) ?? []

  const completed = data?.jobsCompleted ?? 0
  const failed = data?.jobsFailed ?? 0
  const terminal = completed + failed
  const successPct = terminal > 0 ? Math.round((completed / terminal) * 100) : 0

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

        <Grid size={{ xs: 12, md: 6, lg: 5 }}>
          <BreakdownCard
            title="Usage per pipeline"
            items={usageItems}
            isLoading={isLoading}
            emptyText="No usage events recorded yet."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 5 }}>
          <BreakdownCard
            title="Jobs by status"
            items={statusItems}
            isLoading={statusLoading}
            emptyText="No jobs to display."
          />
        </Grid>
        <Grid size={{ xs: 12, lg: 2 }}>
          <Card
            variant="outlined"
            sx={{ height: '100%' }}
          >
            <CardContent
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%'
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Overall success rate
              </Typography>
              {isLoading ? (
                <Skeleton
                  variant="text"
                  width={80}
                />
              ) : (
                <React.Fragment>
                  <Typography variant="h3">{successPct}%</Typography>
                  <Box sx={{ width: '100%', mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={successPct}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {completed} completed / {failed} failed
                  </Typography>
                </React.Fragment>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default KpiCards
