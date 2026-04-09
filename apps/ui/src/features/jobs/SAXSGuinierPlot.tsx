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
}

interface SAXSGuinierPlotProps {
  data: SAXSDataPoint[]
  qmin: number
  qmax: number
}

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

  return (
    <Box sx={{ mt: 1, mb: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ mb: 0.5 }}
      >
        SAXS Data Preview — highlighted region shows Guinier fit range (q:{' '}
        {qmin.toFixed(4)}–{qmax.toFixed(4)} Å⁻¹) used for Rg calculation.
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
            fill="rgba(255, 200, 0, 0.25)"
            stroke="rgba(200, 150, 0, 0.6)"
            strokeWidth={1}
            label={{ value: 'Guinier', position: 'top', fontSize: 11 }}
          />
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
