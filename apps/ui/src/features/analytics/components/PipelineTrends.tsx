import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Skeleton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from '@mui/material'
import { useGetJobsTimeseriesQuery } from '../../../slices/analyticsApiSlice'

export const PipelineTrends: React.FC = () => {
  const { data, isLoading } = useGetJobsTimeseriesQuery({ granularity: 'day' })

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Job Submissions (daily)
        </Typography>
        {isLoading ? (
          <Skeleton
            variant="rectangular"
            height={140}
          />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
                <TableCell align="right">Count</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.map((row) => (
                <TableRow key={row.day}>
                  <TableCell>{row.day}</TableCell>
                  <TableCell align="right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export default PipelineTrends
