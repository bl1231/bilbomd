import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Skeleton
} from '@mui/material'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useGetJobsByTypeQuery } from '../../../slices/analyticsApiSlice'

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#d0ed57']

export const JobsByTypePie: React.FC = () => {
  const { data, isLoading } = useGetJobsByTypeQuery()

  const chartData =
    data?.map((d) => ({ name: d.pipeline, value: d.count })) ?? []

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Jobs by Pipeline
        </Typography>
        {isLoading ? (
          <Skeleton
            variant="rectangular"
            height={250}
          />
        ) : chartData.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            No jobs to display.
          </Typography>
        ) : (
          <React.Fragment>
            <Box sx={{ justifyContent: 'center', display: 'flex' }}>
              <ResponsiveContainer
                width="100%"
                height={250}
              >
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                mt: 2
              }}
            >
              {chartData.map((d, index) => (
                <Chip
                  key={d.name}
                  label={`${d.name}: ${d.value}`}
                  sx={{
                    m: 0.5,
                    backgroundColor: COLORS[index % COLORS.length],
                    color: '#000',
                    fontWeight: 'bold'
                  }}
                />
              ))}
            </Box>
          </React.Fragment>
        )}
      </CardContent>
    </Card>
  )
}

export default JobsByTypePie
