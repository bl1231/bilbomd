import { Theme } from '@mui/material/styles'

export default function Typography(theme: Theme) {
  return {
    MuiTypography: {
      styleOverrides: {
        gutterBottom: {
          marginBottom: 12
        }
      },
      variants: [
        {
          props: { variant: 'mythingee' },
          style: {
            textTransform: 'uppercase',
            fontSize: 12,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            fontWeight: 500,
            padding: '0.5rem',
            background: theme.palette.sectionHeader.background,
            color: theme.palette.sectionHeader.text,
            letterSpacing: '1px',
            py: 2
          }
        }
      ]
    }
  }
}
