import { Fragment } from 'react'
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

type Props = {
  foxsData: FoxsData[]
  guinier: GuinierFit
}

const DimensionlessKratkyChart = ({ foxsData, guinier }: Props) => {
  const theme = useTheme()
  const kratkyData = buildKratkyData(foxsData, guinier)

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
            iconType="line"
            verticalAlign="bottom"
            height={30}
            layout="horizontal"
            align="center"
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
                strokeWidth={index === 0 ? 2.5 : 1}
                dot={false}
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
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              Rg (Guinier)
            </TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.75rem' }}>
              {guinier.rg.toFixed(2)} Å
            </TableCell>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              I(0)
            </TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.75rem' }}>
              {guinier.i0.toExponential(2)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              Guinier fit range
            </TableCell>
            <TableCell sx={{ py: 0.25, pr: 3, border: 0, fontSize: '0.75rem' }}>
              q: {guinier.qmin.toFixed(4)}–{guinier.qmax.toFixed(4)} Å⁻¹
            </TableCell>
            <TableCell
              sx={{ py: 0.25, pr: 2, border: 0, color: 'text.secondary', fontSize: '0.75rem' }}
            >
              r²
            </TableCell>
            <TableCell sx={{ py: 0.25, border: 0, fontSize: '0.75rem' }}>
              {guinier.r2 != null ? guinier.r2.toFixed(3) : 'n/a'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}

export default DimensionlessKratkyChart
