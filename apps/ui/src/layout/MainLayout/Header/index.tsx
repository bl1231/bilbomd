import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CssBaseline,
  CircularProgress,
  Alert,
  Box
} from '@mui/material'
import useAuth from 'hooks/useAuth'
import DeploySite from 'layout/DeploySite'
import MenuIcon from '@mui/icons-material/Menu'
import { Link } from 'react-router'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import UserMenu from './UserMenu'

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
  const { username, displayName, email, status } = useAuth()

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

  const mode = config.mode || ''
  const deploySite = config.deploySite || ''

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
            {/* Left Side: Hamburger (mobile), Logo and Mode Display */}
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
                to="/dashboard"
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
            </Box>

            {/* Right Side: account menu, which holds the color theme */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                ml: 'auto',
                minWidth: 0
              }}
            >
              <UserMenu
                displayName={displayName}
                username={username}
                email={email}
                role={status}
              />
            </Box>
          </Toolbar>
        </AppBar>
      </Box>
    </>
  )
}

export default Header
