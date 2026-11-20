import { PaletteMode } from '@mui/material'
import { createTheme } from '@mui/material/styles'
import Typography from './typography'
import componentsOverride from './overrides'
import { green, red, amber, grey, blueGrey } from '@mui/material/colors'

declare module '@mui/material/styles' {
  interface Palette {
    ochre: Palette['primary']
    bilbomdStatus: {
      completed: string
      error: string
      running: string
      submitted: string
      pending: string
      failed: string
      cancelled: string
      unknown: string
      // Deletion requested, not yet confirmed by the server
      deleting: string
    }
    nerscStatus: {
      running: string
    }
    /** The bar across the top of a titled section (HeaderBox, instructions) */
    sectionHeader: {
      background: string
      text: string
    }
    /** A bordered wrapper panel around page content */
    panel: {
      background: string
      border: string
      header: string
      /** A faintly raised area inside a section, e.g. a nested accordion */
      subtle: string
    }
  }

  interface PaletteOptions {
    ochre?: PaletteOptions['primary']
    bilbomdStatus?: {
      completed?: string
      error?: string
      running?: string
      submitted?: string
      pending?: string
      failed?: string
      cancelled?: string
      unknown?: string
      deleting?: string
    }
    nerscStatus?: {
      running?: string
    }
    sectionHeader?: {
      background?: string
      text?: string
    }
    panel?: {
      background?: string
      border?: string
      header?: string
      subtle?: string
    }
  }
}

// Dark-mode surface for Paper, Accordion, menus and dialogs
const DARK_PAPER = '#1A2027'

const getDesignTokens = (mode: PaletteMode) => {
  const themeTypography = Typography(`'Quicksand'`)

  const theme = createTheme({
    palette: {
      mode,
      ...(mode === 'dark' && {
        background: { default: '#121212', paper: DARK_PAPER }
      }),
      sectionHeader:
        mode === 'dark'
          ? { background: blueGrey[700], text: '#fff' }
          : { background: '#888', text: '#fff' },
      panel:
        mode === 'dark'
          ? {
              background: DARK_PAPER,
              border: grey[700],
              header: blueGrey[700],
              subtle: 'rgba(255, 255, 255, 0.06)'
            }
          : {
              background: grey[200],
              border: grey[500],
              header: grey[500],
              subtle: '#f5f5f5'
            },
      ochre: {
        main: '#E3D026',
        light: '#E9DB5D',
        dark: '#A29415',
        contrastText: '#242105'
      },
      bilbomdStatus: {
        completed: green[500],
        error: red[500],
        running: amber[200],
        submitted: amber[100],
        pending: green[100],
        failed: red[300],
        cancelled: grey[200],
        unknown: grey[300],
        deleting: red[100]
      },
      nerscStatus: {
        running: amber[100]
      }
    },
    breakpoints: {
      values: {
        xs: 0,
        sm: 768,
        md: 1024,
        lg: 1266,
        xl: 1536
      }
    },
    direction: 'ltr',
    mixins: {
      toolbar: {
        minHeight: 60,
        paddingTop: 8,
        paddingBottom: 8
      }
    },
    typography: themeTypography
  })
  theme.components = componentsOverride(theme)

  return theme
}

export { getDesignTokens }
