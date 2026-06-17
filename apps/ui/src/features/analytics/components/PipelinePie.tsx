import React from 'react'
import { Box, Typography, Skeleton } from '@mui/material'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PIPELINE_COLORS } from './pipelineColors'

export interface PipelineSlice {
  name: string
  value: number
}

export const PipelinePie: React.FC<{
  data: PipelineSlice[]
  isLoading?: boolean
  height?: number
  emptyText?: string
}> = ({ data, isLoading, height = 250, emptyText = 'No data to display.' }) => {
  if (isLoading) {
    return (
      <Skeleton
        variant="rectangular"
        height={height}
      />
    )
  }

  if (!data || data.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
      >
        {emptyText}
      </Typography>
    )
  }

  return (
    <Box sx={{ justifyContent: 'center', display: 'flex' }}>
      <ResponsiveContainer
        width="100%"
        height={height}
      >
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={95}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) =>
              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  )
}

export default PipelinePie
