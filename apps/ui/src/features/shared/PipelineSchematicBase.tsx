import { useTheme } from '@mui/material/styles'

export interface PipelineStep {
  lines: string[]
  color: string
}

type ColorDef = { fill: string; stroke: string; text: string }

interface Props {
  row0: PipelineStep[]
  row1: PipelineStep[]
  ariaLabel: string
  extraColors?: (isDark: boolean) => Record<string, ColorDef>
}

const BOX_W = 110
const BOX_H = 52
const GAP = 28
const LEFT_PAD = 26
const RIGHT_PAD = 20
const ROW_Y = [10, 90] as const
const WRAP_LEFT_X = LEFT_PAD - 20
const LEAD_IN = 20
const ROW0_MID_Y = ROW_Y[0] + BOX_H / 2
const ROW1_MID_Y = ROW_Y[1] + BOX_H / 2
const WRAP_Y_MID =
  ROW_Y[0] + BOX_H + Math.round((ROW_Y[1] - ROW_Y[0] - BOX_H) / 2)
const SVG_H = ROW_Y[1] + BOX_H + 10

const boxX = (i: number) => LEFT_PAD + i * (BOX_W + GAP)

const PipelineSchematicBase = ({
  row0,
  row1,
  ariaLabel,
  extraColors
}: Props) => {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const LAST_BOX_RIGHT = boxX(row0.length - 1) + BOX_W
  const WRAP_RIGHT_X = LAST_BOX_RIGHT + 14
  const SVG_W = LEFT_PAD + row0.length * (BOX_W + GAP) - GAP + RIGHT_PAD

  const defaultColors: Record<string, ColorDef> = {
    blue: {
      fill: isDark ? (theme.palette.primary?.dark ?? '#1565c0') : '#dbeafe',
      stroke: theme.palette.primary?.main ?? '#1976d2',
      text: isDark ? '#e0f2fe' : '#1e3a5f'
    },
    green: {
      fill: isDark ? (theme.palette.success?.dark ?? '#1b5e20') : '#dcfce7',
      stroke: theme.palette.success?.main ?? '#2e7d32',
      text: isDark ? '#d1fae5' : '#14532d'
    },
    purple: {
      fill: isDark ? (theme.palette.secondary?.dark ?? '#4a148c') : '#ede9fe',
      stroke: theme.palette.secondary?.main ?? '#9c27b0',
      text: isDark ? '#ede9fe' : '#3b0764'
    }
  }

  const colors = { ...defaultColors, ...extraColors?.(isDark) }

  const arrowColor = isDark ? '#94a3b8' : '#64748b'
  const arrowHead = `M0,0 L6,3 L0,6 Z`

  const renderBox = (step: PipelineStep, x: number, y: number, key: string) => {
    const c = colors[step.color]
    if (!c) return null
    const lineH = 14
    const totalTextH = step.lines.length * lineH
    const textStartY = y + BOX_H / 2 - totalTextH / 2 + lineH * 0.75
    return (
      <g key={key}>
        <rect
          x={x}
          y={y}
          width={BOX_W}
          height={BOX_H}
          rx={6}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={1.5}
        />
        {step.lines.map((line, i) => (
          <text
            key={i}
            x={x + BOX_W / 2}
            y={textStartY + i * lineH}
            textAnchor="middle"
            fontSize={10}
            fontFamily={theme.typography?.fontFamily ?? 'sans-serif'}
            fill={c.text}
            fontWeight={500}
          >
            {line}
          </text>
        ))}
      </g>
    )
  }

  const renderArrow = (x1: number, y: number, key: string) => (
    <g key={key}>
      <line
        x1={x1}
        y1={y + BOX_H / 2}
        x2={x1 + GAP - 6}
        y2={y + BOX_H / 2}
        stroke={arrowColor}
        strokeWidth={1.5}
      />
      <path
        d={arrowHead}
        transform={`translate(${x1 + GAP - 6}, ${y + BOX_H / 2 - 3})`}
        fill={arrowColor}
      />
    </g>
  )

  const wrapArrow = (
    <g key="wrap">
      <polyline
        points={`${LAST_BOX_RIGHT},${ROW0_MID_Y} ${WRAP_RIGHT_X},${ROW0_MID_Y} ${WRAP_RIGHT_X},${WRAP_Y_MID} ${WRAP_LEFT_X},${WRAP_Y_MID} ${WRAP_LEFT_X},${ROW1_MID_Y} ${WRAP_LEFT_X + LEAD_IN},${ROW1_MID_Y}`}
        fill="none"
        stroke={arrowColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d={arrowHead}
        transform={`translate(${WRAP_LEFT_X + LEAD_IN - 6}, ${ROW1_MID_Y - 3})`}
        fill={arrowColor}
      />
    </g>
  )

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ width: '100%', display: 'block' }}
      aria-label={ariaLabel}
    >
      {row0.map((step, i) => {
        const x = boxX(i)
        return (
          <g key={`r0-${i}`}>
            {renderBox(step, x, ROW_Y[0], `r0-box-${i}`)}
            {i < row0.length - 1 &&
              renderArrow(x + BOX_W, ROW_Y[0], `r0-arr-${i}`)}
          </g>
        )
      })}
      {wrapArrow}
      {row1.map((step, i) => {
        const x = boxX(i)
        return (
          <g key={`r1-${i}`}>
            {renderBox(step, x, ROW_Y[1], `r1-box-${i}`)}
            {i < row1.length - 1 &&
              renderArrow(x + BOX_W, ROW_Y[1], `r1-arr-${i}`)}
          </g>
        )
      })}
    </svg>
  )
}

export default PipelineSchematicBase
