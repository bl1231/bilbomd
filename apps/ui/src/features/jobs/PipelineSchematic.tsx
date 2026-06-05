import { Typography, Paper } from '@mui/material'
import Grid from '@mui/material/Grid'
import HeaderBox from 'components/HeaderBox'
import ClassicPDBOpenMMPipelineSchematic from './ClassicPDBOpenMMPipelineSchematic'
import ClassicPDBCharmmPipelineSchematic from './ClassicPDBCharmmPipelineSchematic'
import ClassicCRDPipelineSchematic from './ClassicCRDPipelineSchematic'

const PipelineSchematic = ({
  pipeline,
  mdEngine
}: {
  isDarkMode?: boolean
  pipeline: string
  mdEngine: 'charmm' | 'openmm'
}) => {
  // Safeguard: CRD/PSF is only compatible with CHARMM
  const effectiveMdEngine = pipeline === 'crd_psf' ? 'charmm' : mdEngine

  return (
    <Grid size={{ xs: 12 }}>
      <HeaderBox>
        <Typography>
          BilboMD Classic Schematic -{' '}
          {pipeline === 'pdb'
            ? `PDB inputs (${effectiveMdEngine.toUpperCase()})`
            : 'CRD/PSF inputs (CHARMM)'}
        </Typography>
      </HeaderBox>
      <Paper sx={{ p: 2 }}>
        {pipeline === 'pdb' && effectiveMdEngine === 'openmm' ? (
          <ClassicPDBOpenMMPipelineSchematic />
        ) : pipeline === 'pdb' && effectiveMdEngine === 'charmm' ? (
          <ClassicPDBCharmmPipelineSchematic />
        ) : (
          <ClassicCRDPipelineSchematic />
        )}
      </Paper>
    </Grid>
  )
}

export default PipelineSchematic
