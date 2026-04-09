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
import { Typography, Box } from '@mui/material'

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
  if (data.length === 0) return null

  return (
    <Box sx={{ mt: 1, mb: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ mb: 0.5 }}
      >
        SAXS Data Preview — highlighted region shows Guinier fit range (q:{' '}
        {qmin.toFixed(4)}–{qmax.toFixed(4)} Å⁻¹)
      </Typography>
      <ResponsiveContainer
        width="100%"
        height={260}
      >
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="q"
            type="number"
            scale="linear"
            domain={['auto', 'auto']}
            label={{ value: 'q (Å⁻¹)', position: 'insideBottomRight', offset: -5 }}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <YAxis
            scale="log"
            type="number"
            domain={['auto', 'auto']}
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
    </Box>
  )
}

export default SAXSGuinierPlot
