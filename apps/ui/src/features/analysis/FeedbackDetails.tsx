import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import type {
  FeedbackFinding,
  FeedbackSeverity,
  FoxsData
} from '@bilbomd/bilbomd-types'
import {
  REGION_LABEL,
  SEVERITY_LABEL,
  stateLabel,
  type FeedbackView
} from './feedbackModel'

const SEVERITY_ICON: Record<FeedbackSeverity, React.ReactElement> = {
  good: (
    <CheckCircleOutlineIcon
      color="success"
      titleAccess={SEVERITY_LABEL.good}
    />
  ),
  info: (
    <InfoOutlinedIcon
      color="info"
      titleAccess={SEVERITY_LABEL.info}
    />
  ),
  warning: (
    <WarningAmberIcon
      color="warning"
      titleAccess={SEVERITY_LABEL.warning}
    />
  ),
  problem: (
    <ErrorOutlineIcon
      color="error"
      titleAccess={SEVERITY_LABEL.problem}
    />
  )
}

const format = (value: number | undefined, digits: number): string =>
  value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits)

export const FindingsList = ({ findings }: { findings: FeedbackFinding[] }) => (
  <Box>
    <Typography variant="h4">Findings</Typography>
    <List
      dense
      aria-label="Findings"
    >
      {findings.map((finding) => (
        <ListItem
          key={finding.code}
          alignItems="flex-start"
          disableGutters
        >
          <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
            {SEVERITY_ICON[finding.severity]}
          </ListItemIcon>
          <ListItemText
            primary={finding.title}
            secondary={finding.detail}
            slotProps={{
              primary: { sx: { fontWeight: 500 } },
              secondary: { sx: { maxWidth: '85ch' } }
            }}
          />
        </ListItem>
      ))}
    </List>
  </Box>
)

export const RegionsTable = ({ view }: { view: FeedbackView }) => (
  <Box>
    <Typography variant="h4">By q-region</Typography>
    <TableContainer>
      <Table
        size="small"
        aria-label="Fit by q-region"
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Region</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>q (Å⁻¹)</TableCell>
            {!view.legacy && (
              <TableCell
                align="right"
                sx={{ fontWeight: 'bold' }}
              >
                Points
              </TableCell>
            )}
            <TableCell
              align="right"
              sx={{ fontWeight: 'bold' }}
            >
              χ²
            </TableCell>
            <TableCell
              align="right"
              sx={{ fontWeight: 'bold' }}
            >
              Mean residual (σ)
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {view.regions.map((region) => (
            <TableRow key={region.name}>
              <TableCell>{REGION_LABEL[region.name]}</TableCell>
              <TableCell>
                {region.q_min.toFixed(2)} – {region.q_max.toFixed(2)}
              </TableCell>
              {!view.legacy && (
                <TableCell align="right">{region.n_points}</TableCell>
              )}
              <TableCell align="right">
                {region.chi_square.toFixed(2)}
              </TableCell>
              <TableCell align="right">
                {region.mean_residual.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
)

export const ModelsTable = ({
  view,
  foxsData
}: {
  view: FeedbackView
  foxsData?: FoxsData[]
}) => {
  const metrics = new Map(foxsData?.map((fit) => [fit.filename, fit]))
  const hasMetrics = view.models.some(
    (model) => metrics.get(model.file)?.chi2free !== undefined
  )
  return (
    <Box>
      <Typography variant="h4">By ensemble size</Typography>
      <TableContainer>
        <Table
          size="small"
          aria-label="Fit by ensemble size"
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Model</TableCell>
              <TableCell
                align="right"
                sx={{ fontWeight: 'bold' }}
              >
                χ²
              </TableCell>
              {hasMetrics && (
                <>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 'bold' }}
                  >
                    χ²<sub>free</sub>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 'bold' }}
                  >
                    V<sub>r</sub>
                  </TableCell>
                </>
              )}
              <TableCell sx={{ fontWeight: 'bold' }}>Assessed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {view.models.map((model) => (
              <TableRow
                key={model.file}
                selected={model.selected}
              >
                <TableCell sx={{ textTransform: 'capitalize' }}>
                  {stateLabel(model.states)}
                </TableCell>
                <TableCell align="right">
                  {model.chi_square.toFixed(2)}
                </TableCell>
                {hasMetrics && (
                  <>
                    <TableCell align="right">
                      {format(metrics.get(model.file)?.chi2free, 2)}
                    </TableCell>
                    <TableCell align="right">
                      {format(metrics.get(model.file)?.vr, 3)}
                    </TableCell>
                  </>
                )}
                <TableCell>{model.selected ? 'Yes' : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

// The thresholds below mirror the constants in
// tools/python/pipeline_decision_tree.py and saxs_mw.py. Keep them in step.
export const HowAssessed = () => (
  <Accordion
    disableGutters
    variant="outlined"
  >
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography>How this is assessed</Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Typography
        variant="body2"
        component="div"
        sx={{ maxWidth: '85ch', '& p': { mt: 0, mb: 1 } }}
      >
        <p>
          <strong>Which model.</strong> MultiFoXS fits ensembles of increasing
          size. The smallest one is assessed for which adding another state
          lowers χ² by less than 20%.
        </p>
        <p>
          <strong>Fit.</strong> χ² is the mean squared residual. Below 1 the
          model fits within the experimental errors, 1 to 2 is acceptable, and 2
          or more is a poor fit. Below 0.5 the errors are probably
          over-estimated, and χ² cannot rank models.
        </p>
        <p>
          <strong>q-regions.</strong> The data are split at q = 0.1 and 0.2 Å⁻¹.
          A region with χ² above 2 is reported as a misfit. Low q reports on
          overall size and mass, mid q on shape and domain arrangement, and high
          q is weak signal that is sensitive to buffer subtraction.
        </p>
        <p>
          <strong>Molecular weight.</strong> The model&apos;s mass is summed
          from its atoms. The SAXS estimate uses the volume of correlation (
          <Link
            href="https://doi.org/10.1038/nature12070"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rambo &amp; Tainer, 2013
          </Link>
          ), integrated to q = 0.3 Å⁻¹. It is typically good to 10–20% and reads
          low for flexible, extended particles, so only a difference above 30%
          is flagged. For protein–nucleic acid mixtures, a noisy Guinier region,
          or data ending below q = 0.25 Å⁻¹ the estimate is shown as indicative
          only.
        </p>
      </Typography>
    </AccordionDetails>
  </Accordion>
)
