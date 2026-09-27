import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material'
import { FoxsData, FitMetricsInfo } from '@bilbomd/bilbomd-types'
import { getEnsembleSizeLabel } from './foxsUtils'

interface FitMetricsTableProps {
  foxsData: FoxsData[]
  fitMetrics: FitMetricsInfo
}

const format = (value: number | undefined, digits: number): string =>
  value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits)

const rowLabel = (filename: string): string =>
  /multi_state_model_\d+_/.test(filename)
    ? getEnsembleSizeLabel(filename)
    : 'Original model'

const COLUMNS = [
  {
    label: 'χ²',
    help: 'FoXS χ² over every data point.'
  },
  {
    label: 'χ²free',
    help: 'Median χ² over random subsets with one point per Shannon channel (Rambo & Tainer 2013). Counts each independent piece of information once, so it is harder to lower by overfitting than χ². Values near 1 mean the model fits to within the errors.'
  },
  {
    label: 'Vr',
    help: 'Volatility of the ratio I_exp / I_model across Shannon channels (Hura et al. 2013). Independent of overall scale and less sensitive to systematic errors such as buffer subtraction. 0 means the curves differ only by a constant factor.'
  }
]

const FitMetricsTable = ({ foxsData, fitMetrics }: FitMetricsTableProps) => (
  <Box>
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', pl: 2, m: 1 }}
    >
      <Typography variant="h4">Fit quality</Typography>
      <Tooltip title="Dmax is estimated from the Guinier Rg rather than measured, so treat χ²free and Vr as indicative.">
        <Chip
          label="beta"
          size="small"
          color="warning"
          variant="outlined"
        />
      </Tooltip>
    </Stack>
    <TableContainer>
      <Table
        size="small"
        aria-label="Fit quality metrics"
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Model</TableCell>
            {COLUMNS.map(({ label, help }) => (
              <TableCell
                key={label}
                align="right"
                sx={{ fontWeight: 'bold' }}
              >
                <Tooltip title={help}>
                  <span>{label}</span>
                </Tooltip>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {foxsData.map((fit) => (
            <TableRow key={fit.filename}>
              <TableCell>{rowLabel(fit.filename)}</TableCell>
              <TableCell align="right">{format(fit.chisq, 2)}</TableCell>
              <TableCell align="right">{format(fit.chi2free, 2)}</TableCell>
              <TableCell align="right">{format(fit.vr, 3)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ pl: 2, mt: 1 }}
    >
      χ²free and Vr use Shannon channels of width π/Dmax, with Dmax ≈{' '}
      {fitMetrics.dmax.toFixed(0)} Å estimated as {fitMetrics.dmaxPerRg} × the
      Guinier R<sub>g</sub> ({fitMetrics.shannonChannels} channels, χ²free over{' '}
      {fitMetrics.chi2freeRounds} random subsets). Vr only uses q ≤{' '}
      {fitMetrics.vrQmax} Å⁻¹, where the data are not dominated by noise. Lower
      is better for all three; compare values within this job rather than across
      jobs.
    </Typography>
  </Box>
)

export default FitMetricsTable
