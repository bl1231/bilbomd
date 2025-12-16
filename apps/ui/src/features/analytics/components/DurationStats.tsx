import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Skeleton
} from '@mui/material'
import { useGetUsageDurationStatsQuery } from '../../../slices/analyticsApiSlice'

const formatMs = (ms?: number) => {
  if (!ms || ms <= 0) return '-'
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  const remS = Math.round(s % 60)
  return `${m}m ${remS}s`
}

export const DurationStats: React.FC = () => {
  const { data, isLoading } = useGetUsageDurationStatsQuery()

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Duration Statistics (completed jobs)
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
                <TableCell>Pipeline</TableCell>
                <TableCell align="right">Avg</TableCell>
                <TableCell align="right">p50</TableCell>
                <TableCell align="right">p90</TableCell>
                <TableCell align="right">Count</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.map((row) => (
                <TableRow key={row.pipeline}>
                  <TableCell>{row.pipeline}</TableCell>
                  <TableCell align="right">{formatMs(row.avgMs)}</TableCell>
                  <TableCell align="right">{formatMs(row.p50Ms)}</TableCell>
                  <TableCell align="right">{formatMs(row.p90Ms)}</TableCell>
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

export default DurationStats
