import { Theme, alpha } from '@mui/material/styles'

export default function Button(theme: Theme) {
  const disabledStyle = {
    '&.Mui-disabled': {
      backgroundColor: theme.palette.grey[300],
      color: theme.palette.grey[700]
    }
  }

  return {
    MuiButton: {
      defaultProps: {
        disableElevation: true
      },
      styleOverrides: {
        root: {
          fontWeight: 500,
          '&.job-details-button': {
            height: '24px',
            // Light greys wash out dark mode's light-blue button text
            backgroundColor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.primary.main, 0.12)
                : theme.palette.grey[200],
            '&:hover': {
              backgroundColor:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.primary.main, 0.24)
                  : 'white'
            }
          }
        },
        contained: {
          ...disabledStyle
        },
        outlined: {
          ...disabledStyle
        }
      }
    }
  }
}
