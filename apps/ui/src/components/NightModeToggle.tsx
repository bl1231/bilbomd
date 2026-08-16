import { Box, Button, ButtonProps } from '@mui/material'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import { useThemeContext } from '../themes/ThemeContext'

const NightModeToggle: React.FC<ButtonProps> = ({ sx, ...props }) => {
  const { mode, toggleColorMode } = useThemeContext()

  return (
    <Button
      onClick={toggleColorMode}
      color='inherit'
      size='large'
      endIcon={mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
      sx={{
        backgroundColor: mode === 'dark' ? 'grey.800' : 'grey.200',
        color: mode === 'dark' ? 'grey.200' : 'grey.800',
        '&:hover': {
          backgroundColor: mode === 'dark' ? 'grey.700' : 'grey.300'
        },
        borderRadius: '20px', // Optional: adds a rounded look
        px: { xs: 1, sm: 2 }, // Optional: padding for a better button size
        minWidth: { xs: 0, sm: 64 },
        // On phones the label is hidden, so drop the end-icon gap too
        '& .MuiButton-endIcon': { ml: { xs: 0, sm: 1 } },
        ...sx
      }}
      {...props}
    >
      <Box
        component='span'
        sx={{ display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}
      >
        {mode === 'dark' ? `light mode` : `dark mode`}
      </Box>
    </Button>
  )
}

export default NightModeToggle
