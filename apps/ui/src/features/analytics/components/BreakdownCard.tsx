import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  Chip,
  Skeleton
} from '@mui/material'
import { PipelinePie } from './PipelinePie'
import { PIPELINE_COLORS } from './pipelineColors'

export interface BreakdownItem {
  label: string
  value: number
}

export const BreakdownCard: React.FC<{
  title: string
  items: BreakdownItem[]
  isLoading?: boolean
  emptyText?: string
}> = ({ title, items, isLoading, emptyText }) => {
  const pieData = items.map((i) => ({ name: i.label, value: i.value }))

  return (
    <Card
      variant="outlined"
      sx={{ height: '100%' }}
    >
      <CardContent>
        <Typography
          variant="subtitle2"
          color="text.secondary"
          gutterBottom
        >
          {title}
        </Typography>
        <Grid
          container
          spacing={2}
          sx={{ alignItems: 'center' }}
        >
          <Grid size={{ xs: 12, sm: 5 }}>
            {isLoading ? (
              <Skeleton
                variant="rectangular"
                height={36}
              />
            ) : (
              <Stack
                direction="column"
                spacing={1}
                sx={{ alignItems: 'flex-start' }}
              >
                {items.map((item, index) => (
                  <Chip
                    key={item.label}
                    label={`${item.label}: ${item.value}`}
                    size="small"
                    sx={{
                      backgroundColor:
                        PIPELINE_COLORS[index % PIPELINE_COLORS.length],
                      color: '#000',
                      fontWeight: 'bold'
                    }}
                  />
                ))}
              </Stack>
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 7 }}>
            <PipelinePie
              data={pieData}
              isLoading={isLoading}
              emptyText={emptyText}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default BreakdownCard
