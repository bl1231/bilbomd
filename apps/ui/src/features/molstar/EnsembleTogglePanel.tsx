import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

interface EnsembleTogglePanelProps {
  ensembleSizes: number[]
  visibility: Record<number, boolean>
  onToggle: (size: number) => void
  onToggleAll: (action: 'show' | 'hide') => void
  hasConstraints?: boolean
  domainColorActive?: boolean
  onColorByDomain?: () => void
}

const EnsembleTogglePanel = ({
  ensembleSizes,
  visibility,
  onToggle,
  onToggleAll,
  hasConstraints,
  domainColorActive,
  onColorByDomain
}: EnsembleTogglePanelProps) => {
  const showEnsembleControls = ensembleSizes.length >= 2
  const showSingleEnsembleChip = ensembleSizes.length === 1
  const showDomainButton = !!hasConstraints && !!onColorByDomain

  if (!showEnsembleControls && !showSingleEnsembleChip && !showDomainButton) return null

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
      {showSingleEnsembleChip && (
        <>
          <Typography variant='body2'>Ensembles:</Typography>
          <Chip
            label={`Size ${ensembleSizes[0]}`}
            size='small'
            variant='outlined'
            color='primary'
          />
        </>
      )}

      {showEnsembleControls && (
        <>
          <Typography variant='body2'>Ensembles:</Typography>
          <Button
            size='small'
            variant='outlined'
            onClick={() => onToggleAll(allVisible ? 'hide' : 'show')}
            sx={{ textTransform: 'none', minWidth: 72, alignSelf: 'stretch' }}
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
        </>
      )}

      {showDomainButton && (
        <Button
          size='small'
          variant={domainColorActive ? 'contained' : 'outlined'}
          onClick={onColorByDomain}
          sx={{ textTransform: 'none', minWidth: 120, alignSelf: 'stretch' }}
        >
          Color by Domain
        </Button>
      )}
    </Box>
  )
}

export default EnsembleTogglePanel
