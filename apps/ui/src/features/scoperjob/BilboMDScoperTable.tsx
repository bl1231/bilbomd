import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
  LinearProgress,
  Box,
  Typography
} from '@mui/material'
import type { ScoperJobResults } from '@bilbomd/bilbomd-types'

interface BilboMDScoperTableProps {
  results: ScoperJobResults
}

const BilboMDScoperTable = ({ results }: BilboMDScoperTableProps) => {
  const rows = [
    {
      key: 'KGS Number of Conformations to Generate',
      value: results.kgs_conformations
    },
    { key: 'KGS Progress', value: results.kgs_files },
    { key: 'FoXS Top File', value: results.foxs_top_file },
    // { key: 'FoXS Top Score', value: results.foxsTopScore
    // { key: 'IonNet threshold', value: results.predictionThreshold },
    {
      key: 'Number of predicted Mg ions',
      value: results.multifoxs_ensemble_size
    }
    // { key: 'MultiFoXS Best Chi2 Score', value: results.multifoxsScore }
  ]

  // Calculate progress percentage
  const kgsConformations = Number(results.kgs_conformations) || 0
  const kgsFiles = Number(results.kgs_files) || 0
  const progress =
    kgsConformations > 0 ? Math.round((kgsFiles / kgsConformations) * 100) : 0

  return (
    <TableContainer component={Paper}>
      <Table
        size="small"
        aria-label="simple table"
      >
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell
                component="th"
                scope="row"
              >
                {row.key}
              </TableCell>
              <TableCell align="right">{row.value}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell
              component="th"
              scope="row"
            >
              KGS Progress Bar
            </TableCell>
            <TableCell align="right">
              <Box sx={{ minWidth: 120 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.5 }}
                >
                  {`${progress}%`}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export { BilboMDScoperTable }
