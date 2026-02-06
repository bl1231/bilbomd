import { Typography, Paper } from '@mui/material'
import Grid from '@mui/material/Grid'
import HeaderBox from 'components/HeaderBox'

const PipelineSchematic = ({
  isDarkMode,
  mdEngine
}: {
  isDarkMode: boolean
  mdEngine: 'charmm' | 'openmm'
}) => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox>
      <Typography>BilboMD Auto Schematic</Typography>
    </HeaderBox>
    <Paper sx={{ p: 2 }}>
      <img
        src={
          isDarkMode
            ? `/images/bilbomd-auto-schematic-${mdEngine}-dark.png`
            : `/images/bilbomd-auto-schematic-${mdEngine}.png`
        }
        alt="Overview of BilboMD AF pipeline"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </Paper>
  </Grid>
)

export default PipelineSchematic
