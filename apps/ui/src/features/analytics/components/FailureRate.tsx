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
        {isLoading ? (
          <Skeleton
            variant="rectangular"
            height={140}
          />
        ) : (
          <Stack spacing={1}>
            {data?.map((item) => {
              const pct = Math.round((item.successRate || 0) * 100)
              return (
                <Box key={item.pipeline}>
                  <Typography
                    variant="body2"
                    gutterBottom
                  >
                    {item.pipeline} — {pct}% ({item.total} events)
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
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
