import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

interface EnsembleTogglePanelProps {
  ensembleSizes: number[]
  visibility: Record<number, boolean>
  onToggle: (size: number) => void
}

const EnsembleTogglePanel = ({
  ensembleSizes,
  visibility,
  onToggle
}: EnsembleTogglePanelProps) => {
  if (ensembleSizes.length < 2) return null

  const selectedSizes = ensembleSizes.filter((s) => visibility[s])

  const handleChange = (
    _: React.MouseEvent<HTMLElement>,
    newSelected: number[]
  ) => {
    const oldSet = new Set(selectedSizes)
    const newSet = new Set(newSelected)
    for (const size of ensembleSizes) {
      if (oldSet.has(size) !== newSet.has(size)) {
        onToggle(size)
      }
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5
      }}
    >
      <Typography variant='body2'>Ensembles:</Typography>
      <ToggleButtonGroup
        size='small'
        value={selectedSizes}
        onChange={handleChange}
      >
        {ensembleSizes.map((size) => (
          <ToggleButton
            key={size}
            value={size}
          >
            Size {size}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

export default EnsembleTogglePanel
