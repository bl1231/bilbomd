import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  IconButton,
  Toolbar,
  Typography
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import NightModeToggle from 'components/NightModeToggle'
// import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import nerscLogo from 'assets/nersc-logo.png'
import useAuth from 'hooks/useAuth'

const linkStyles = {
  fontFamily: 'monospace',
  fontWeight: 900,
  fontSize: { xs: '2em', sm: '3em' },
  letterSpacing: { xs: '.15rem', sm: '.3rem' },
  background: 'linear-gradient(to top, #00c9ff, #92fe9d)', // Blue to Light Green
  WebkitBackgroundClip: 'text', // Ensures gradient is applied only to the text
  WebkitTextFillColor: 'transparent', // Makes the text transparent so gradient shows
  color: 'transparent', // Fallback for other browsers
  textDecoration: 'none',
  whiteSpace: 'nowrap'
}

// interface NerscLogoProps {
//   useNersc: boolean
//   mode: string
// }

// const NerscLogo = ({ useNersc, mode }: NerscLogoProps) =>
//   useNersc && (
//     <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '100%', p: 1 }}>
//       <img
//         src={nerscLogo}
//         alt="NERSC Logo"
//         style={{ height: '30px' }}
//       />
//       {mode === 'development' && (
//         <Typography
//           variant="h5"
//           component="span"
//           sx={{ ml: 1, pb: 0.2, color: 'yellow' }}
//         >
//           DEVELOPMENT
//         </Typography>
//       )}
//     </Box>
//   )

// const ModeDisplay = ({ useNersc, mode }: NerscLogoProps) =>
//   !useNersc && (
//     <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '100%', p: 1 }}>
//       {mode !== 'local' && (
//         <Typography
//           variant="h5"
//           component="span"
//           sx={{ ml: 1, pb: 0.2 }}
//         >
//           BL12.3.1
//         </Typography>
//       )}
//       {mode === 'development' && (
//         <Typography
//           variant="h5"
//           component="span"
//           sx={{ ml: 1, pb: 0.2, color: 'yellow' }}
//         >
//           DEVELOPMENT
//         </Typography>
//       )}
//       {mode === 'local' && (
//         <Box>
//           <Typography
//             variant="h5"
//             component="span"
//             sx={{ ml: 1, pb: 0.2 }}
//           >
//             LOCAL
//           </Typography>
//           <Typography
//             variant="h5"
//             component="span"
//             sx={{ ml: 1, pb: 0.2, color: 'yellow' }}
//           >
//             DEVELOPMENT
//           </Typography>
//         </Box>
//       )}
//     </Box>
//   )

interface DeploySiteProps {
  deploySite: string
}

const DeploySite = ({ deploySite }: DeploySiteProps) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
    {deploySite === 'nersc' && (
      <img
        src={nerscLogo}
        alt="NERSC Logo"
        style={{ height: '30px' }}
      />
    )}
    {deploySite === 'local' && (
      <Typography
        variant="h5"
        component="span"
        sx={{ ml: 1 }}
      >
        LOCAL
      </Typography>
    )}
    {deploySite === 'bl1231' && (
      <Typography
        variant="h5"
        component="span"
        sx={{ ml: 1, pb: 0 }}
      >
        BL12.3.1
      </Typography>
    )}
  </Box>
)

interface DevModeProps {
  mode: string
}
const DevMode = ({ mode }: DevModeProps) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
    {mode === 'development' && (
      <Typography
        variant="h5"
        component="span"
        sx={{ ml: 1, pb: 0, color: 'yellow' }}
      >
        DEVELOPMENT
      </Typography>
    )}
  </Box>
)

interface HeaderProps {
  onMenuClick?: () => void
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { isAuthenticated } = useAuth()

  const {
    data: config,
    isLoading: configIsLoading,
    error: configError
  } = useGetConfigsQuery('configData')

  if (configIsLoading) return <CircularProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration data</Alert>
  if (!config)
    return <Alert severity="warning">No configuration data available</Alert>

  // const useNersc = config.useNersc?.toLowerCase() === 'true'
  const mode = config.mode || 'nope'
  const deploySite = config.deploySite || ''

  return (
    <>
      <CssBaseline />
      <Box sx={{ flexGrow: 1 }}>
        <AppBar
          position="fixed"
          elevation={0}
          sx={{ height: '70px', zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <Toolbar sx={{ display: 'flex', alignItems: 'center', m: 0 }}>
            <IconButton
              color="inherit"
              aria-label="open navigation menu"
              edge="start"
              onClick={onMenuClick}
              sx={{ display: { xs: 'inline-flex', md: 'none' }, mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 0 }}>
              <Typography
                component={Link}
                to="/welcome"
                sx={linkStyles}
              >
                BilboMD
              </Typography>
            </Box>
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'flex-end',
                flexGrow: 1,
                pt: 1.5
              }}
            >
              <DeploySite deploySite={deploySite} />
              <DevMode mode={mode} />
              {isAuthenticated ? null : (
                <Typography sx={{ ml: 1 }}>anonymous</Typography>
              )}
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexGrow: 1,
                ml: 'auto'
              }}
            >
              <Button
                variant="contained"
                to="register"
                component={Link}
                sx={{
                  mx: { xs: 0.5, sm: 1 },
                  borderRadius: 2,
                  whiteSpace: 'nowrap'
                }}
              >
                Register
              </Button>
              <Button
                variant="contained"
                to="magicklink"
                component={Link}
                sx={{
                  mx: { xs: 0.5, sm: 1 },
                  borderRadius: 2,
                  whiteSpace: 'nowrap'
                }}
              >
                Login
              </Button>
              <NightModeToggle />
            </Box>
          </Toolbar>
        </AppBar>
      </Box>
    </>
  )
}

export default Header
