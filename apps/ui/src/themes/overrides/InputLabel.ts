import { Theme } from '@mui/material/styles'

export default function InputLabel(theme: Theme) {
  return {
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color:
            theme.palette.mode === 'dark'
              ? theme.palette.text.secondary
              : theme.palette.grey[600]
        },
        outlined: {
          lineHeight: '0.8em',
          '&.MuiInputLabel-sizeSmall': {
            lineHeight: '1em'
          },
          '&.MuiInputLabel-shrink': {
            background: theme.palette.background.paper,
            // In dark mode MUI lightens each Paper with a white gradient
            // (--Paper-overlay, set per elevation and inherited here), so
            // the label needs the same overlay to match the panel behind it
            ...(theme.palette.mode === 'dark' && {
              backgroundImage: 'var(--Paper-overlay, none)'
            }),
            padding: '0 8px',
            marginLeft: -6,
            lineHeight: '1.4375em'
          }
        }
      }
    }
  }
}
