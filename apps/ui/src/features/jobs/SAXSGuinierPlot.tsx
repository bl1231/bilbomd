import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea
} from 'recharts'
import { Typography, Box, Table, TableBody, TableRow, TableCell } from '@mui/material'

interface SAXSDataPoint {
  q: number
  intensity: number
  error?: number
}

interface SAXSGuinierPlotProps {
  data: SAXSDataPoint[]
  qmin: number
  qmax: number
}

type Segment = { x1: number; x2: number }

const SAXSGuinierPlot = ({ data, qmin, qmax }: SAXSGuinierPlotProps) => {
  const validData = data.filter((d) => d.intensity > 0)
  if (validData.length === 0) return null

  const qValues = validData.map((d) => d.q)
  const intensities = validData.map((d) => d.intensity)

  const xDomain: [number, number] = [Math.min(...qValues), Math.max(...qValues)]

  const yMin = Math.min(...intensities)
  const yMax = Math.max(...intensities)
  const yDomain: [number, number] = [
    Math.pow(10, Math.floor(Math.log10(yMin))),
    Math.pow(10, Math.ceil(Math.log10(yMax)))
  ]

  // Find contiguous q-ranges where SNR < 1 (σ > I)
  const lowSnrSegments: Segment[] = []
  let segStart: number | null = null
  for (let i = 0; i < validData.length; i++) {
    const pt = validData[i]
    const snrLow =
      pt.error !== undefined &&
      isFinite(pt.error) &&
      pt.error > 0 &&
      pt.error >= pt.intensity

    if (snrLow) {
      if (segStart === null) segStart = pt.q
    } else {
      if (segStart !== null) {
        lowSnrSegments.push({ x1: segStart, x2: validData[i - 1].q })
        segStart = null
      }
    }
  }
  if (segStart !== null) {
    lowSnrSegments.push({ x1: segStart, x2: validData[validData.length - 1].q })
  }

  return (
    <Box sx={{ mt: 1, mb: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ mb: 0.5 }}
      >
        SAXS Data Preview — green region: Guinier fit range (q:{' '}
        {qmin.toFixed(4)}–{qmax.toFixed(4)} Å⁻¹) used for Rg calculation.
        {lowSnrSegments.length > 0 &&
          ' Red region(s): low signal-to-noise (σ > I) — data may be unreliable.'}
      </Typography>
      <ResponsiveContainer
        width="100%"
        height={260}
      >
        <LineChart
          data={validData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="q"
            type="number"
            scale="linear"
            domain={xDomain}
            label={{
              value: 'q (Å⁻¹)',
              position: 'insideBottomRight',
              offset: -5
            }}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <YAxis
            scale="log"
            type="number"
            domain={yDomain}
            label={{ value: 'I(q)', angle: -90, position: 'insideLeft' }}
            tickFormatter={(v: number) => v.toExponential(1)}
            width={70}
          />
          <Tooltip
            formatter={(value) =>
              typeof value === 'number'
                ? [value.toExponential(3), 'I(q)']
                : [String(value), 'I(q)']
            }
            labelFormatter={(label) => `q = ${Number(label).toFixed(4)} Å⁻¹`}
          />
          <Legend verticalAlign="bottom" />
          <ReferenceArea
            x1={qmin}
            x2={qmax}
            fill="rgba(40, 180, 80, 0.2)"
            stroke="rgba(20, 140, 50, 0.5)"
            strokeWidth={1}
            label={{ value: 'Guinier', position: 'top', fontSize: 11 }}
          />
          {lowSnrSegments.map((seg, i) => (
            <ReferenceArea
              key={`snr-${i}`}
              x1={seg.x1}
              x2={seg.x2}
              fill="rgba(220, 60, 60, 0.2)"
              stroke="rgba(200, 0, 0, 0.4)"
              strokeWidth={1}
              label={
                i === 0
                  ? { value: 'Low SNR', position: 'top', fontSize: 11 }
                  : undefined
              }
            />
          ))}
          <Line
            type="monotone"
            dataKey="intensity"
            name="Exp. Intensity"
            stroke="#5b8dd9"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <Table
        size="small"
        sx={{ mt: 1, width: 'auto' }}
      >
        <TableBody>
          <TableRow>
            <TableCell sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}>q min</TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.75rem' }}>{xDomain[0].toFixed(4)} Å⁻¹</TableCell>
            <TableCell sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}>I(q) min</TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.75rem' }}>{yMin.toExponential(2)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}>q max</TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.75rem' }}>{xDomain[1].toFixed(4)} Å⁻¹</TableCell>
            <TableCell sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}>I(q) max</TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.75rem' }}>{yMax.toExponential(2)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}

export default SAXSGuinierPlot
