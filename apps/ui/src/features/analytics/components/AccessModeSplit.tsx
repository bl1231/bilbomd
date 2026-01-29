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
import { useGetUsageAccessModeSplitQuery } from '../../../slices/analyticsApiSlice'

export const AccessModeSplit: React.FC = () => {
  const { data, isLoading } = useGetUsageAccessModeSplitQuery()

  const grouped = (data ?? []).reduce<
    Record<string, { user: number; anonymous: number }>
  >((acc, cur) => {
    const key = cur.pipeline
    acc[key] ??= { user: 0, anonymous: 0 }
    acc[key][cur.access_mode] += cur.count
    return acc
  }, {})

  const rows = Object.entries(grouped)

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Access Mode Split
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
                <TableCell align="right">User</TableCell>
                <TableCell align="right">Anonymous</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(([pipeline, counts]) => (
                <TableRow key={pipeline}>
                  <TableCell>{pipeline}</TableCell>
                  <TableCell align="right">{counts.user}</TableCell>
                  <TableCell align="right">{counts.anonymous}</TableCell>
                  <TableCell align="right">
                    {counts.user + counts.anonymous}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export default AccessModeSplit
