import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography
} from '@mui/material'
import Grid from '@mui/material/Grid'
import type { FoxsData } from '@bilbomd/bilbomd-types'
import {
  ALERT_SEVERITY,
  describeDiff,
  stateLabel,
  type FeedbackView,
  type MwStatus
} from './feedbackModel'

const SELECTION_HELP =
  'BilboMD assesses the smallest ensemble that fits: states are added only while each one lowers χ² by at least 20%.'

const format = (value: number | null | undefined, digits: number): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '—'

const Tile = ({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) => (
  <Grid size={{ xs: 12, md: 4 }}>
    <Paper
      variant="outlined"
      sx={{ p: 2, height: '100%' }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        component="h3"
        sx={{ lineHeight: 1.5 }}
      >
        {title}
      </Typography>
      {children}
    </Paper>
  </Grid>
)

const Headline = ({
  value,
  unit
}: {
  value: string
  unit?: React.ReactNode
}) => (
  <Typography
    sx={{ fontSize: '1.75rem', fontWeight: 500, lineHeight: 1.3 }}
    component="p"
  >
    {value}
    {unit && (
      <Typography
        component="span"
        color="text.secondary"
        sx={{ ml: 0.5 }}
      >
        {unit}
      </Typography>
    )}
  </Typography>
)

const Line = ({ children }: { children: React.ReactNode }) => (
  <Typography
    variant="body2"
    color="text.secondary"
  >
    {children}
  </Typography>
)

const MW_CHIP: Record<
  MwStatus,
  { label: string; color: 'success' | 'warning' | 'default' }
> = {
  consistent: { label: 'Consistent', color: 'success' },
  differs: { label: 'Differs', color: 'warning' },
  low_confidence: { label: 'Indicative only', color: 'default' },
  not_assessed: { label: 'Not assessed', color: 'default' },
  legacy: { label: 'Not available', color: 'default' }
}

const MwTile = ({ view }: { view: FeedbackView }) => {
  const { mw } = view
  const chip = MW_CHIP[mw.status]
  return (
    <Tile title="Molecular weight">
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        {mw.status !== 'legacy' && (
          <Headline
            value={format(mw.modelKda, 1)}
            unit="kDa model"
          />
        )}
        <Chip
          label={chip.label}
          color={chip.color}
          size="small"
          variant="outlined"
        />
      </Stack>
      {mw.status === 'legacy' ? (
        <Line>
          This job was assessed before the molecular-weight comparison was
          corrected, so it is not shown.
        </Line>
      ) : (
        <>
          <Line>
            SAXS estimate ≈ {format(mw.saxsKda, 1)} kDa
            {typeof mw.diffFraction === 'number' &&
              ` (${describeDiff(mw.diffFraction)} than the model)`}
          </Line>
          {mw.note && <Line>{mw.note}</Line>}
        </>
      )}
    </Tile>
  )
}

type FeedbackSummaryProps = {
  view: FeedbackView
  // The assessed model's entry in the FoXS data, when it has loaded
  fit?: FoxsData
  // The experimental profile's entry, which carries the Guinier fit
  base?: FoxsData
}

// The verdict and the three headline numbers
const FeedbackSummary = ({ view, fit, base }: FeedbackSummaryProps) => {
  const { verdict, assessed, regions } = view
  const qMin = regions[0]?.q_min
  const qMax = regions[regions.length - 1]?.q_max
  const rg = view.mw.guinierRg ?? base?.guinier?.rg
  const hasFitMetrics = fit?.chi2free !== undefined || fit?.vr !== undefined

  return (
    <Stack spacing={2}>
      <Alert severity={ALERT_SEVERITY[verdict.severity]}>
        <AlertTitle>{verdict.title}</AlertTitle>
        {verdict.detail && <Box>{verdict.detail}</Box>}
        <Box sx={{ mt: verdict.detail ? 0.5 : 0 }}>
          Assessed: the {stateLabel(assessed.states)}{' '}
          <Tooltip title={SELECTION_HELP}>
            <Box
              component="span"
              tabIndex={0}
              sx={{ textDecoration: 'underline dotted', cursor: 'help' }}
            >
              why this one?
            </Box>
          </Tooltip>
        </Box>
      </Alert>

      <Grid
        container
        spacing={2}
      >
        <Tile title="Fit quality">
          <Headline
            value={assessed.chiSquare.toFixed(2)}
            unit="χ²"
          />
          {hasFitMetrics ? (
            <Line>
              χ²<sub>free</sub> {format(fit?.chi2free, 2)} · V<sub>r</sub>{' '}
              {format(fit?.vr, 3)}{' '}
              <Tooltip title="χ²free and Vr are estimated with a Dmax derived from the Guinier Rg; see the FoXS Analysis tab for how they are computed.">
                <Chip
                  label="beta"
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ ml: 0.5, height: 18 }}
                />
              </Tooltip>
            </Line>
          ) : (
            <Line>Values near 1 mean the model fits within the errors.</Line>
          )}
        </Tile>

        <MwTile view={view} />

        <Tile title="Data">
          <Headline
            value={format(rg, 1)}
            unit={
              <>
                Å Guinier R<sub>g</sub>
              </>
            }
          />
          <Line>
            q from {format(qMin, 3)} to {format(qMax, 3)} Å⁻¹
          </Line>
        </Tile>
      </Grid>
    </Stack>
  )
}

export default FeedbackSummary
