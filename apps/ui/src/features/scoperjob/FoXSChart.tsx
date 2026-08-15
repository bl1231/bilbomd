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
import { Box, Stack, Typography, useTheme } from '@mui/material'

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
  const theme = useTheme()

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
          {excludedCount} point{excludedCount !== 1 ? 's' : ''} excluded from
          plot (shaded region{excludedCount !== 1 ? 's' : ''}): model &le; 0
          or SNR &lt; 1
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
      <Stack
        direction="row"
        spacing={2.5}
        useFlexGap
        sx={{ pl: 2, mb: 1, flexWrap: 'wrap', color: 'text.primary' }}
      >
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          Chi&sup2;: {chisq.toFixed(2)}
        </Typography>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          C
          <Box
            component="sub"
            sx={{ fontSize: '0.7em' }}
          >
            1
          </Box>
          : {c1}
        </Typography>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
          C
          <Box
            component="sub"
            sx={{ fontSize: '0.7em' }}
          >
            2
          </Box>
          : {c2}
        </Typography>
      </Stack>
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
            stroke={theme.palette.text.secondary}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

export default FoXSChart
