import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material'
import type { FeedbackRegion } from '@bilbomd/bilbomd-types'
import {
  REGION_LABEL,
  qAxisTicks,
  residualAxisLimit,
  type ResidualPoint
} from './feedbackModel'

type ResidualsChartProps = {
  points: ResidualPoint[]
  regions: FeedbackRegion[]
}

type TooltipPayload = { payload?: { q: number; shown: number; raw: number } }

const ResidualTooltip = ({
  active,
  payload
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <Paper
      variant="outlined"
      sx={{ px: 1, py: 0.5 }}
    >
      <Typography variant="body2">q = {point.q.toFixed(4)} Å⁻¹</Typography>
      <Typography variant="body2">
        residual = {point.raw.toFixed(2)} σ
      </Typography>
    </Paper>
  )
}

// Hundreds of points share the plot, so each is a small dot
const ResidualDot = ({
  cx,
  cy,
  fill
}: {
  cx?: number
  cy?: number
  fill?: string
}) =>
  cx === undefined || cy === undefined ? null : (
    <circle
      cx={cx}
      cy={cy}
      r={2.5}
      fill={fill}
      fillOpacity={0.6}
    />
  )

// Error-normalised residuals of the assessed model against q. A good fit
// scatters evenly about zero, mostly within ±2; a run of points on one side
// of zero is a systematic misfit, and the shaded bands show which q-region it
// falls in.
const ResidualsChart = ({ points, regions }: ResidualsChartProps) => {
  const theme = useTheme()
  const limit = residualAxisLimit(points)
  // Points beyond the axis are drawn at its edge rather than dropped
  const data = points.map((point) => ({
    q: point.q,
    raw: point.residual,
    shown: Math.max(-limit, Math.min(limit, point.residual))
  }))
  const clipped = points.filter(
    (point) => Math.abs(point.residual) > limit
  ).length
  const axisColor = theme.palette.text.secondary
  // On a phone the bands are too narrow for the χ² as well; the table below
  // has it
  const narrow = useMediaQuery(theme.breakpoints.down('sm'))
  const qMin = data[0]?.q ?? 0
  const qMax = data[data.length - 1]?.q ?? 1
  const qTicks = qAxisTicks(qMin, qMax)

  return (
    <Box>
      <Typography variant="h4">Residuals of the assessed model</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 1, maxWidth: '75ch' }}
      >
        (I<sub>exp</sub> − I<sub>model</sub>) / σ at every data point. A good
        fit scatters evenly about zero, mostly between the dashed lines at ±2. A
        run of points on one side of zero is a systematic misfit.
      </Typography>
      <ResponsiveContainer
        width="100%"
        height={300}
      >
        <ScatterChart margin={{ top: 24, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid
            stroke={theme.palette.divider}
            vertical={false}
          />
          {regions.map((region, index) => (
            <ReferenceArea
              key={region.name}
              x1={Math.max(region.q_min, qMin)}
              x2={Math.min(region.q_max, qMax)}
              y1={-limit}
              y2={limit}
              fill={theme.palette.text.primary}
              fillOpacity={index % 2 === 0 ? 0.04 : 0}
              stroke="none"
              label={{
                value: narrow
                  ? REGION_LABEL[region.name]
                  : `${REGION_LABEL[region.name]} · χ² ${region.chi_square.toFixed(2)}`,
                position: 'top',
                fill: axisColor,
                fontSize: 12
              }}
            />
          ))}
          <XAxis
            dataKey="q"
            type="number"
            domain={[qMin, qMax]}
            ticks={qTicks}
            tickFormatter={(value: number) => value.toFixed(2)}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 12 }}
            label={{
              value: 'q (Å⁻¹)',
              position: 'insideBottom',
              offset: -12,
              fill: axisColor
            }}
          />
          <YAxis
            dataKey="shown"
            type="number"
            domain={[-limit, limit]}
            allowDecimals={false}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 12 }}
            width={48}
            label={{
              value: 'Residual (σ)',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              fill: axisColor
            }}
          />
          <ReferenceLine
            y={0}
            stroke={axisColor}
          />
          <ReferenceLine
            y={2}
            stroke={axisColor}
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={-2}
            stroke={axisColor}
            strokeDasharray="4 4"
          />
          <Tooltip
            cursor={{ stroke: theme.palette.divider }}
            content={<ResidualTooltip />}
          />
          <Scatter
            data={data}
            fill={theme.palette.primary.main}
            fillOpacity={0.6}
            shape={<ResidualDot />}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
      {clipped > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
        >
          {clipped} {clipped === 1 ? 'point lies' : 'points lie'} beyond ±
          {limit} σ and {clipped === 1 ? 'is' : 'are'} drawn at the edge.
        </Typography>
      )}
    </Box>
  )
}

export default ResidualsChart
