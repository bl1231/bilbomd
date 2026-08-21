import { useTheme } from '@mui/material'

type LegendEntry = {
  value?: string | number
  color?: string
  dataKey?: unknown
}

type Props = {
  payload?: ReadonlyArray<LegendEntry>
  isHidden: (dataKey: string) => boolean
  onToggle: (dataKey: string) => void
}

/**
 * Custom recharts Legend content: prefixes an all-caps hint so users know
 * the entries are clickable, then renders each series with a line-swatch
 * icon. Hidden series are grayed out with a strikethrough. Pass via
 * <Legend content={(props) => <ClickableLegend payload={props.payload} ... />} />
 */
const ClickableLegend = ({ payload, isHidden, onToggle }: Props) => {
  const theme = useTheme()
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 16,
        rowGap: 4,
        userSelect: 'none'
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: theme.palette.text.secondary
        }}
      >
        CLICK TO TOGGLE VISIBILITY &rarr;
      </span>
      {(payload ?? []).map((entry, i) => {
        const key = typeof entry.dataKey === 'string' ? entry.dataKey : ''
        const hidden = key ? isHidden(key) : false
        const color = hidden ? theme.palette.text.disabled : entry.color
        return (
          <span
            key={`${key}-${i}`}
            onClick={() => key && onToggle(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              color,
              textDecoration: hidden ? 'line-through' : undefined
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 2,
                backgroundColor: color
              }}
            />
            {entry.value}
          </span>
        )
      })}
    </div>
  )
}

export default ClickableLegend
