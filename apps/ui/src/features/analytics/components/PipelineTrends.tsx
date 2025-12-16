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
  TableCell,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material'
import { useGetJobsTimeseriesQuery } from '../../../slices/analyticsApiSlice'

export const PipelineTrends: React.FC = () => {
  const [granularity, setGranularity] = React.useState<
    'day' | 'week' | 'month'
  >('day')
  const { data, isLoading } = useGetJobsTimeseriesQuery({ granularity })

  const LIMITS: Record<'day' | 'week' | 'month', number> = {
    day: 7,
    week: 8,
    month: 12
  }

  const labelByGranularity: Record<'day' | 'week' | 'month', string> = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly'
  }

  const limitedData = React.useMemo(() => {
    if (!data || data.length === 0) return []
    const limit = LIMITS[granularity]
    // Assume API returns chronological order; take the most recent N entries
    return data.slice(-limit)
  }, [data, granularity])

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
        >
          Job Submissions ({labelByGranularity[granularity]})
        </Typography>
        <FormControl
          component="fieldset"
          sx={{ mb: 2 }}
        >
          <FormLabel component="legend">Granularity</FormLabel>
          <RadioGroup
            row
            aria-label="granularity"
            name="granularity"
            value={granularity}
            onChange={(e) =>
              setGranularity(e.target.value as 'day' | 'week' | 'month')
            }
          >
            <FormControlLabel
              value="day"
              control={<Radio />}
              label="Daily"
            />
            <FormControlLabel
              value="week"
              control={<Radio />}
              label="Weekly"
            />
            <FormControlLabel
              value="month"
              control={<Radio />}
              label="Monthly"
            />
          </RadioGroup>
        </FormControl>
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
              {limitedData.map((row) => (
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
