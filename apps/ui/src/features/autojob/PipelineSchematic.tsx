import { Typography, Paper } from '@mui/material'
import Grid from '@mui/material/Grid'
import HeaderBox from 'components/HeaderBox'
import AutoOpenMMPipelineSchematic from './AutoOpenMMPipelineSchematic'
import AutoCharmmPipelineSchematic from './AutoCharmmPipelineSchematic'

const PipelineSchematic = ({
  mdEngine
}: {
  isDarkMode?: boolean
  mdEngine: 'charmm' | 'openmm'
}) => (
  <Grid size={{ xs: 12 }}>
    <HeaderBox>
      <Typography>BilboMD Auto Schematic</Typography>
    </HeaderBox>
    <Paper sx={{ p: 2 }}>
      {mdEngine === 'openmm' ? (
        <AutoOpenMMPipelineSchematic />
      ) : (
        <AutoCharmmPipelineSchematic />
      )}
    </Paper>
  </Grid>
)

export default PipelineSchematic
