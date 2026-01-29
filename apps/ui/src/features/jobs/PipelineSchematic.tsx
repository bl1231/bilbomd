import { Typography, Paper } from '@mui/material'
import Grid from '@mui/material/Grid'
import HeaderBox from 'components/HeaderBox'

const PipelineSchematic = ({
  isDarkMode,
  pipeline,
  mdEngine
}: {
  isDarkMode: boolean
  pipeline: string
  mdEngine: 'charmm' | 'openmm'
}) => {
  // Safeguard: CRD/PSF is only compatible with CHARMM
  const effectiveMdEngine = pipeline === 'crd_psf' ? 'charmm' : mdEngine

  const getSchematicPath = (): string => {
    const baseTheme = isDarkMode ? '-dark' : ''

    if (pipeline === 'pdb') {
      return `/images/bilbomd-classic-pdb-schematic-${effectiveMdEngine}${baseTheme}.png`
    } else {
      // CRD/PSF pipeline always uses CHARMM
      return `/images/bilbomd-classic-crd-schematic${baseTheme}.png`
    }
  }

  const getAltText = (): string => {
    if (pipeline === 'pdb') {
      return `Overview of BilboMD PDB pipeline using ${effectiveMdEngine.toUpperCase()}`
    } else {
      return 'Overview of BilboMD CRD/PSF pipeline using CHARMM'
    }
  }

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
        <img
          src={getSchematicPath()}
          alt={getAltText()}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </Paper>
    </Grid>
  )
}

export default PipelineSchematic
