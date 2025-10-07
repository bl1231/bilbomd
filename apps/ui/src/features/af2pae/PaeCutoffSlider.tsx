import { Alert, AlertTitle, Chip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import Grid from '@mui/material/Grid'

interface PaeCutoffSliderProps {
  setFieldValue: (
    field: string,
    value: number | number[],
    shouldValidate?: boolean
  ) => void
  value: number
}

function valuetext(value: number) {
  return `${value}`
}

export default function PaeCutoffSlider({
  setFieldValue,
  value
}: PaeCutoffSliderProps) {
  const handleChange = (_event: Event, newValue: number | number[]) => {
    const valueToSet = Array.isArray(newValue) ? newValue[0] : newValue

    setFieldValue('pae_cutoff', valueToSet)
  }

  return (
    <Box sx={{ width: 420, mt: 4 }}>
      <Typography sx={{ mb: 1 }}>
        Select <b>PAE Cutoff</b> value (default is 10)
      </Typography>
      <Grid
        container
        spacing={2}
        alignItems="center"
      >
        <Grid>
          <Chip
            label={value}
            variant="outlined"
            color="success"
            sx={{
              width: 60,
              justifyContent: 'center'
            }}
          />
        </Grid>
        <Grid sx={{ flex: 1 }}>
          <Slider
            value={value}
            valueLabelFormat={valuetext}
            getAriaValueText={valuetext}
            step={1}
            min={5}
            max={30}
            valueLabelDisplay="auto"
            onChange={handleChange}
            track={false}
          />
        </Grid>
        <Alert severity="info">
          <AlertTitle>PAE Cutoff (Å)</AlertTitle>

          <Typography variant="body2">
            Controls how permissive the graph is when connecting residues.
            Residue pairs with predicted alignment error (PAE) values below this
            cutoff are considered linked in the clustering graph; pairs above it
            are ignored.
          </Typography>

          <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: '1.5rem' }}>
            <li>
              <Typography variant="body2">
                <strong>Lower values</strong> (e.g., 6–8 Å) → only very
                confident, close interactions are kept → smaller, tighter
                clusters.
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Higher values</strong> (e.g., 12–20 Å) → include looser,
                more uncertain relationships → larger, more diffuse clusters.
              </Typography>
            </li>
          </ul>

          <Typography variant="body2">
            In practice, the cutoff determines how much “fuzziness” you allow
            when identifying regions that move together.
          </Typography>
        </Alert>
      </Grid>
    </Box>
  )
}
