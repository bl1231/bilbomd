import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ErrorBar
} from 'recharts'
import { Typography } from '@mui/material'

interface DataPoint {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

interface ResidualDataPoint {
  q: number
  res: number
}

interface ExcludedRange {
  x1: number
  x2: number
}

interface FoXSChartProps {
  title: string
  data: DataPoint[]
  residualsData: ResidualDataPoint[]
  chisq: number
  c1: string
  c2: string
  minYAxis: number
  maxYAxis: number
  excludedCount?: number
  excludedRanges?: ExcludedRange[]
}

interface CustomChartLabelProps {
  chisq: number
  c1: string
  c2: string
  x: number
  y: number
}

const ChiSquaredChartLabel = ({
  chisq,
  c1,
  c2,
  x,
  y
}: CustomChartLabelProps) => {
  return (
    <>
      <text
        x={x}
        y={y}
        fill="black"
        fontSize={16}
      >
        Chi²: {chisq.toFixed(2)}
      </text>
      <text
        x={x + 80}
        y={y}
        fill="black"
        fontSize={16}
      >
        C
        <tspan
          dy="3"
          fontSize={10}
        >
          1
        </tspan>
        <tspan
          dy="-3"
          fontSize={14}
        >
          : {c1}
        </tspan>
      </text>
      <text
        x={x + 140}
        y={y}
        fill="black"
        fontSize={16}
      >
        C
        <tspan
          dy="3"
          fontSize={10}
        >
          2
        </tspan>
        <tspan
          dy="-3"
          fontSize={14}
        >
          : {c2}
        </tspan>
      </text>
    </>
  )
}

const logDomain = (dataMin: number): number => {
  if (!Number.isFinite(dataMin) || dataMin <= 0) return 0.001
  return Math.pow(10, Math.floor(Math.log10(dataMin)))
}

const FoXSChart = ({
  title,
  data,
  residualsData,
  chisq,
  c1,
  c2,
  minYAxis,
  maxYAxis,
  excludedCount = 0,
  excludedRanges = []
}: FoXSChartProps) => {
  const labelXPosition = 75
  const labelYPosition = 20

  return (
    <>
      <Typography
        variant="h5"
        sx={{ pl: 2, m: 1 }}
      >
        {title} - I vs. q
      </Typography>
      {excludedCount > 0 && (
        <Typography
          variant="caption"
          sx={{ pl: 2, color: 'warning.main' }}
        >
          {excludedCount} low-SNR point{excludedCount !== 1 ? 's' : ''} hidden
          (error &ge; intensity)
        </Typography>
      )}
      <ResponsiveContainer
        width="100%"
        height={300}
      >
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="q"
            scale="linear"
            type="number"
          />
          <YAxis
            yAxisId="left"
            scale="log"
            type="number"
            domain={[logDomain, 'auto']}
          />
          <Tooltip />
          <Legend
            iconType="line"
            verticalAlign="bottom"
            height={30}
            layout="horizontal"
          />
          {excludedRanges.map((range, i) => (
            <ReferenceArea
              key={i}
              yAxisId="left"
              x1={range.x1}
              x2={range.x2}
              fill="#ff9800"
              fillOpacity={0.2}
              stroke="#ff9800"
              strokeOpacity={0.6}
            />
          ))}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="exp_intensity"
            name="Exp Intensity"
            stroke="#8884d8"
            activeDot={{ r: 8 }}
          >
            <ErrorBar
              dataKey="error"
              direction="y"
              stroke="#8884d8"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          </Line>
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="model_intensity"
            name="Model Intensity"
            stroke="#82ca9d"
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography
        variant="h5"
        sx={{ pl: 2, m: 1, mt: 3 }}
      >
        {title} - Chi&sup2; residuals
      </Typography>
      <ResponsiveContainer
        width="100%"
        height={200}
      >
        <LineChart data={residualsData}>
          <XAxis
            dataKey="q"
            scale="linear"
            type="number"
          />
          <YAxis domain={[minYAxis, maxYAxis]} />
          <Tooltip />
          <Legend
            iconType="line"
            verticalAlign="bottom"
            height={30}
            layout="horizontal"
            align="center"
          />
          {excludedRanges.map((range, i) => (
            <ReferenceArea
              key={i}
              x1={range.x1}
              x2={range.x2}
              fill="#ff9800"
              fillOpacity={0.2}
              stroke="#ff9800"
              strokeOpacity={0.6}
            />
          ))}
          <Line
            type="monotone"
            dataKey="res"
            name="Residuals"
            stroke="#82ca9d"
          />
          <ReferenceLine
            y={0}
            stroke="black"
            label={
              <ChiSquaredChartLabel
                chisq={chisq}
                c1={c1}
                c2={c2}
                x={labelXPosition}
                y={labelYPosition}
              />
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

export default FoXSChart
