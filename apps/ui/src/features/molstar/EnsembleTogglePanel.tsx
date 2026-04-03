import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

interface EnsembleTogglePanelProps {
  ensembleSizes: number[]
  visibility: Record<number, boolean>
  onToggle: (size: number) => void
  onToggleAll: (action: 'show' | 'hide') => void
}

const EnsembleTogglePanel = ({
  ensembleSizes,
  visibility,
  onToggle,
  onToggleAll
}: EnsembleTogglePanelProps) => {
  if (ensembleSizes.length < 2) return null

  const selectedSizes = ensembleSizes.filter((s) => visibility[s])
  const allVisible = selectedSizes.length === ensembleSizes.length

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
      <Button
        size='small'
        variant='outlined'
        onClick={() => onToggleAll(allVisible ? 'hide' : 'show')}
        sx={{ textTransform: 'none', minWidth: 72 }}
      >
        {allVisible ? 'Hide All' : 'Show All'}
      </Button>
      <ToggleButtonGroup
        size='small'
        value={selectedSizes}
        onChange={handleChange}
      >
        {ensembleSizes.map((size) => (
          <ToggleButton
            key={size}
            value={size}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'white',
                '&:hover': { backgroundColor: 'primary.dark' }
              },
              '&:not(.Mui-selected)': {
                backgroundColor: 'grey.100',
                color: 'text.disabled'
              }
            }}
          >
            Size {size}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

export default EnsembleTogglePanel
