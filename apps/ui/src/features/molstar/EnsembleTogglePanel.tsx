import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { STARTING_MODEL_CSS_COLOR } from './ensembleColors'

interface EnsembleTogglePanelProps {
  ensembleSizes: number[]
  visibility: Record<number, boolean>
  onSelect: (size: number) => void
  hasConstraints?: boolean
  domainColorActive?: boolean
  onColorByDomain?: () => void
  showConformationColor?: boolean
  conformationColorActive?: boolean
  onColorByConformation?: () => void
  showStartingModel?: boolean
  startingModelActive?: boolean
  onToggleStartingModel?: () => void
}

const EnsembleTogglePanel = ({
  ensembleSizes,
  visibility,
  onSelect,
  hasConstraints,
  domainColorActive,
  onColorByDomain,
  showConformationColor,
  conformationColorActive,
  onColorByConformation,
  showStartingModel,
  startingModelActive,
  onToggleStartingModel
}: EnsembleTogglePanelProps) => {
  const showEnsembleControls = ensembleSizes.length >= 2
  const showSingleEnsembleChip = ensembleSizes.length === 1
  const showDomainButton = !!hasConstraints && !!onColorByDomain
  const showConformationButton =
    !!showConformationColor && !!onColorByConformation
  const showStartingModelButton =
    !!showStartingModel && !!onToggleStartingModel

  if (
    !showEnsembleControls &&
    !showSingleEnsembleChip &&
    !showDomainButton &&
    !showConformationButton &&
    !showStartingModelButton
  )
    return null

  // Exactly one ensemble is displayed at a time, so this is an exclusive
  // (radio-like) selector.
  const selectedSize = ensembleSizes.find((s) => visibility[s]) ?? null

  const handleChange = (
    _: React.MouseEvent<HTMLElement>,
    newSelected: number | null
  ) => {
    // Ignore attempts to deselect the active button — keep one always shown.
    if (newSelected !== null) onSelect(newSelected)
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
          <ToggleButtonGroup
            size='small'
            exclusive
            value={selectedSize}
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

      {showConformationButton && (
        <Button
          size='small'
          variant={conformationColorActive ? 'contained' : 'outlined'}
          onClick={onColorByConformation}
          sx={{ textTransform: 'none', minWidth: 160, alignSelf: 'stretch' }}
        >
          Color by Conformation
        </Button>
      )}

      {showStartingModelButton && (
        <Button
          size='small'
          variant={startingModelActive ? 'contained' : 'outlined'}
          onClick={onToggleStartingModel}
          startIcon={
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.5,
                backgroundColor: STARTING_MODEL_CSS_COLOR
              }}
            />
          }
          sx={{ textTransform: 'none', minWidth: 150, alignSelf: 'stretch' }}
        >
          Starting Model
        </Button>
      )}
    </Box>
  )
}

export default EnsembleTogglePanel
