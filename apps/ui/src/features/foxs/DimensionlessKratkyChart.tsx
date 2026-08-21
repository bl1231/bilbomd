import { Fragment, useState } from 'react'
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
  ReferenceDot
} from 'recharts'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  useTheme
} from '@mui/material'
import { FoxsData, GuinierFit } from '@bilbomd/bilbomd-types'
import { getEnsembleSizeLabel, getUniqueColor } from './foxsUtils'
import { buildKratkyData, GLOBULAR_QRG, GLOBULAR_PEAK } from './kratkyUtils'
import ClickableLegend from './ClickableLegend'

type Props = {
  foxsData: FoxsData[]
  guinier: GuinierFit
}

const DimensionlessKratkyChart = ({ foxsData, guinier }: Props) => {
  const theme = useTheme()
  const kratkyData = buildKratkyData(foxsData, guinier)

  // Curves hidden via legend click, keyed by series dataKey. Hidden series
  // keep their legend entry (grayed out) so they can be toggled back on.
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})
  const toggleSeries = (dataKey: string) => {
    setHiddenSeries((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  if (!kratkyData.length) return null

  return (
    <Box>
      <Typography
        variant="h4"
        sx={{ pl: 2, m: 1 }}
      >
        Dimensionless Kratky
      </Typography>
      <Typography
        variant="body1"
        sx={{ pl: 2, mb: 1, color: 'text.secondary' }}
      >
        (qR<sub>g</sub>)²·I(q)/I(0) vs. qR<sub>g</sub> — crosshairs mark the
        peak position of a compact globular particle (√3, 1.104). Curves that
        plateau or rise indicate flexibility/extension.
      </Typography>
      <ResponsiveContainer
        width="100%"
        height={300}
      >
        <LineChart
          data={kratkyData}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="qRg"
            type="number"
            scale="linear"
            domain={[0, 'auto']}
            label={{
              value: 'qRg',
              position: 'insideBottomRight',
              offset: -5
            }}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <YAxis
            type="number"
            domain={[0, 'auto']}
            label={{
              value: '(qRg)²·I(q)/I(0)',
              angle: -90,
              position: 'insideLeft'
            }}
            tickFormatter={(v: number) => v.toFixed(2)}
            width={70}
          />
          <Tooltip
            labelFormatter={(label) => `qRg = ${Number(label).toFixed(3)}`}
          />
          <Legend
            verticalAlign="bottom"
            height={30}
            content={(props) => (
              <ClickableLegend
                payload={props.payload}
                isHidden={(key) => !!hiddenSeries[key]}
                onToggle={toggleSeries}
              />
            )}
          />
          <ReferenceLine
            x={GLOBULAR_QRG}
            stroke={theme.palette.text.secondary}
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={GLOBULAR_PEAK}
            stroke={theme.palette.text.secondary}
            strokeDasharray="4 4"
          />
          <ReferenceDot
            x={GLOBULAR_QRG}
            y={GLOBULAR_PEAK}
            r={4}
            fill={theme.palette.text.secondary}
            stroke="none"
            label={{
              value: 'globular ref.',
              position: 'right',
              fontSize: 11,
              fill: theme.palette.text.secondary
            }}
          />
          <Line
            type="monotone"
            dataKey="exp"
            name="Exp"
            stroke="#8884d8"
            dot={false}
            hide={!!hiddenSeries['exp']}
            isAnimationActive={false}
          />
          {foxsData.map((item, index) => (
            <Fragment key={index}>
              <Line
                type="monotone"
                dataKey={`kratky_model_${index}`}
                name={
                  index === 0
                    ? 'Original Model'
                    : getEnsembleSizeLabel(item.filename)
                }
                stroke={getUniqueColor(index)}
                strokeWidth={2.5}
                dot={false}
                hide={!!hiddenSeries[`kratky_model_${index}`]}
                isAnimationActive={false}
              />
            </Fragment>
          ))}
        </LineChart>
      </ResponsiveContainer>
      <Table
        size="small"
        sx={{ mt: 1, ml: 2, width: 'auto' }}
      >
        <TableBody>
          <TableRow>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.875rem' }}
            >
              Rg (Guinier)
            </TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.875rem' }}>
              {guinier.rg.toFixed(2)} Å
            </TableCell>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.875rem' }}
            >
              I(0)
            </TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.875rem' }}>
              {guinier.i0.toExponential(2)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.875rem' }}
            >
              Guinier fit range
            </TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.875rem' }}>
              q: {guinier.qmin.toFixed(4)}–{guinier.qmax.toFixed(4)} Å⁻¹
            </TableCell>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.875rem' }}
            >
              r²
            </TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.875rem' }}>
              {guinier.r2 != null ? guinier.r2.toFixed(3) : 'n/a'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}

export default DimensionlessKratkyChart
