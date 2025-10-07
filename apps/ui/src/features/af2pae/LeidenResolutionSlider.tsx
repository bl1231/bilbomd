import { Alert, AlertTitle, Chip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import Grid from '@mui/material/Grid'

interface LeidenResolutionSliderProps {
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

export default function LeidenResolutionSlider({
  setFieldValue,
  value
}: LeidenResolutionSliderProps) {
  const handleChange = (_event: Event, newValue: number | number[]) => {
    const valueToSet = Array.isArray(newValue) ? newValue[0] : newValue

    setFieldValue('leiden_resolution', valueToSet)
  }

  return (
    <Box sx={{ width: 420, mt: 4 }}>
      <Typography sx={{ mb: 1 }}>
        Select <b>Leiden Resolution</b> value (default is 0.35)
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
            step={0.01}
            min={0.1}
            max={1.0}
            valueLabelDisplay="auto"
            onChange={handleChange}
            track={false}
          />
        </Grid>
        <Alert severity="info">
          <AlertTitle>Leiden Resolution (γ)</AlertTitle>

          <Typography variant="body2">
            Controls the granularity of clustering when grouping residues into
            domains. Higher resolution values produce more, smaller clusters by
            favoring finer community structure, while lower values produce
            fewer, larger clusters by merging broader regions together.
          </Typography>

          <ul style={{ marginTop: 4, marginBottom: 4, paddingLeft: '1.5rem' }}>
            <li>
              <Typography variant="body2">
                <strong>Lower values</strong> (e.g., 0.2–0.5) → coarse grouping;
                large multi-domain clusters.
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                <strong>Higher values</strong> (e.g., 0.5–1.0) → fine
                segmentation; smaller, more detailed domains.
              </Typography>
            </li>
          </ul>

          <Typography variant="body2">
            Use this to tune how aggressively the algorithm subdivides the PAE
            network.
          </Typography>
        </Alert>
      </Grid>
    </Box>
  )
}
