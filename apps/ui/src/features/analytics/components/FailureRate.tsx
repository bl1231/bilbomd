import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stack,
  Box,
  Skeleton
} from '@mui/material'
import { useGetUsageSuccessRateQuery } from '../../../slices/analyticsApiSlice'

export const FailureRate: React.FC = () => {
  const { data, isLoading } = useGetUsageSuccessRateQuery()

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Success Rate by Pipeline
        </Typography>
        {!isLoading && (!data || data.length === 0) ? (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            No usage events for the selected range.
          </Typography>
        ) : isLoading ? (
          <Skeleton
            variant="rectangular"
            height={140}
          />
        ) : (
          <Stack spacing={1}>
            {data?.map((item) => {
              const successPct = Math.round((item.successRate ?? 0) * 100)
              const failurePct = 100 - successPct
              return (
                <Box key={item.pipeline}>
                  <Typography
                    variant="body2"
                    gutterBottom
                  >
                    {item.pipeline} — {successPct}% success / {failurePct}%
                    failure ({item.total} events)
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={successPct}
                  />
                </Box>
              )
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

export default FailureRate
