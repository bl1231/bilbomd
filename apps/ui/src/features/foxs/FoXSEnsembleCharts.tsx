import { useState } from 'react'
import { Chip, Stack, Typography, useTheme } from '@mui/material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { FoxsData } from '@bilbomd/bilbomd-types'
import { getEnsembleSizeLabel, getUniqueColor } from './foxsUtils'
import ClickableLegend from './ClickableLegend'

type CombinedFoxsData = {
  q: number
  exp_intensity: number
  error?: number
} & Record<string, number>

const logDomain = (dataMin: number): number => {
  if (!Number.isFinite(dataMin) || dataMin <= 0) return 0.001
  return Math.pow(10, Math.floor(Math.log10(dataMin)))
}

type Props = {
  combinedData: CombinedFoxsData[]
  foxsData: FoxsData[]
  minYAxis: number
  maxYAxis: number
}
const FoXSEnsembleCharts = ({
  combinedData,
  minYAxis,
  maxYAxis,
  foxsData
}: Props) => {
  const theme = useTheme()

  // Series hidden via legend/chip click, keyed by ensemble index (shared
  // between the I(q) and residual charts so both stay in sync). The
  // experimental curve maps to index -1. The base dataset (index 0) has its
  // own "Original Model" charts, so it is not rendered here at all.
  const [hidden, setHidden] = useState<Record<number, boolean>>({})
  const toggleIndex = (index: number) => {
    setHidden((prev) => ({ ...prev, [index]: !prev[index] }))
  }
  // 'model_intensity_2' / 'residual_2' -> 2, 'exp_intensity' -> -1
  const seriesIndex = (dataKey: string): number => {
    const match = dataKey.match(/_(\d+)$/)
    return match ? Number(match[1]) : -1
  }
  const isHiddenKey = (dataKey: string) => !!hidden[seriesIndex(dataKey)]
  const toggleKey = (dataKey: string) => toggleIndex(seriesIndex(dataKey))

  const legendContent = (props: {
    payload?: ReadonlyArray<{
      value?: string | number
      color?: string
      dataKey?: unknown
    }>
  }) => (
    <ClickableLegend
      payload={props.payload}
      isHidden={isHiddenKey}
      onToggle={toggleKey}
    />
  )

  return (
    <>
      <Typography
        variant="h4"
        sx={{ pl: 2, m: 1 }}
      >{`Ensemble Models - I vs. q`}</Typography>
      <ResponsiveContainer
        width="100%"
        height={300}
      >
        <LineChart data={combinedData}>
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
            verticalAlign="bottom"
            height={30}
            content={legendContent}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="exp_intensity"
            name="Exp Intensity"
            stroke="#8884d8"
            activeDot={{ r: 8 }}
            dot={{ strokeWidth: 1 }}
            hide={!!hidden[-1]}
          />
          {foxsData.map((item, index) =>
            index === 0 ? null : (
              <Line
                key={index}
                yAxisId="left"
                type="monotone"
                dataKey={`model_intensity_${index}`}
                name={getEnsembleSizeLabel(item.filename)}
                stroke={getUniqueColor(index)}
                dot={{ strokeWidth: 1 }}
                hide={!!hidden[index]}
              />
            )
          )}
        </LineChart>
      </ResponsiveContainer>
      <Typography
        variant="h4"
        sx={{ pl: 2, m: 1, mt: 3 }}
      >
        Ensemble Models - Chi&sup2; residuals
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ pl: 2, mb: 1, flexWrap: 'wrap' }}
      >
        {foxsData.map((item, index) =>
          index !== 0 ? (
            <Chip
              key={index}
              size="small"
              label={`${getEnsembleSizeLabel(item.filename)}: ${item.chisq.toFixed(2)}`}
              onClick={() => toggleIndex(index)}
              aria-pressed={!hidden[index]}
              sx={{
                bgcolor: getUniqueColor(index),
                color: 'common.black',
                fontSize: '0.95rem',
                fontWeight: 600,
                opacity: hidden[index] ? 0.35 : 1,
                '&:hover': { bgcolor: getUniqueColor(index) }
              }}
            />
          ) : null
        )}
      </Stack>
      <ResponsiveContainer
        width="100%"
        height={200}
      >
        <LineChart data={combinedData}>
          <XAxis
            dataKey="q"
            scale="linear"
            type="number"
          />
          <YAxis domain={[minYAxis, maxYAxis]} />
          <Tooltip />
          <Legend
            verticalAlign="bottom"
            height={30}
            content={legendContent}
          />
          {foxsData.map((item, index) =>
            index === 0 ? null : (
              <Line
                key={index}
                type="monotone"
                dataKey={`residual_${index}`}
                name={getEnsembleSizeLabel(item.filename)}
                stroke={getUniqueColor(index)}
                hide={!!hidden[index]}
              />
            )
          )}
          <ReferenceLine
            y={0}
            stroke={theme.palette.text.secondary}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

export default FoXSEnsembleCharts
