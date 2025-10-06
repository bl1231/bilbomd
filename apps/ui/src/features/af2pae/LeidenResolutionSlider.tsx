import { Alert, Chip, Typography } from '@mui/material'
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
        Select <b>Leiden</b> resolution value (default is 0.35)
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
          The Leiden Resolution Higher resolution values lead to more smaller
          communities, while lower resolutions lead to fewer larger communities.
        </Alert>
      </Grid>
    </Box>
  )
}
