import { useState } from 'react'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import {
  AddCircleOutlineOutlined,
  AutoAwesome,
  InfoOutlined
} from '@mui/icons-material'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import useAuth from 'hooks/useAuth'
import Header from './Header'
import Footer from './Footer'
import CookieConsent from 'components/CookieConsent'
import NavDrawer, { NavMenuItem } from 'layout/NavDrawer'

export default function ClippedDrawer() {
  const { isAdmin } = useAuth()
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isSettingsPage = location.pathname.startsWith('/settings')

  if (configIsLoading) return <CircularProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration data</Alert>
  if (!config)
    return <Alert severity="warning">No configuration data available</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'
  const enableBilboMdSANS = config.enableBilboMdSANS?.toLowerCase() === 'true'
  const enableBilboMdScoper =
    config.enableBilboMdScoper?.toLowerCase() === 'true'

  let jobFormsGroup: NavMenuItem[] = [
    {
      text: 'BilboMD Classic',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/classic/new',
      onclick: () => navigate('jobs/classic/new'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD Auto',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/auto/new',
      onclick: () => navigate('jobs/auto/new'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD AF',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/alphafold/new',
      onclick: () => navigate('jobs/alphafold/new'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD OF3',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/openfold/new',
      onclick: () => navigate('jobs/openfold/new'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD SANS',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/sans/new',
      onclick: () => navigate('jobs/sans/new'),
      roles: ['user', 'manager']
    },
    {
      text: 'Scoper',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/scoper/new',
      onclick: () => navigate('jobs/scoper/new'),
      roles: ['user', 'manager']
    }
  ]

  if (useNersc || !enableBilboMdScoper) {
    jobFormsGroup = jobFormsGroup.filter((item) => item.text !== 'Scoper')
  }
  if (!enableBilboMdSANS) {
    jobFormsGroup = jobFormsGroup.filter((item) => item.text !== 'BilboMD SANS')
  }

  const utilitiesGroup: NavMenuItem[] = [
    {
      text: 'inp Jiffy™',
      icon: <AutoAwesome />,
      path: '/jiffy/inp',
      onclick: () => navigate('jiffy/inp'),
      roles: ['user', 'manager']
    },
    {
      text: 'PAE Jiffy™',
      icon: <AutoAwesome />,
      path: '/jiffy/pae',
      onclick: () => navigate('jiffy/pae'),
      roles: ['user']
    }
  ]

  const infoGroup: NavMenuItem[] = [
    {
      text: 'Help',
      icon: <InfoOutlined />,
      path: '/help',
      onclick: () => navigate('/help'),
      roles: ['user']
    },
    {
      text: 'About',
      icon: <InfoOutlined />,
      path: '/about',
      onclick: () => navigate('/about'),
      roles: ['user']
    }
  ]

  const menuGroups = [jobFormsGroup, utilitiesGroup, infoGroup].filter(
    (group) => group.length > 0
  )

  const content = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}
    >
      <Box sx={{ display: 'flex', mb: 8 }}>
        <Header onMenuClick={() => setMobileNavOpen((open) => !open)} />
      </Box>

      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        {!isSettingsPage && (
          <NavDrawer
            menuGroups={menuGroups}
            isAdmin={isAdmin}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
        )}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3 },
            minWidth: 0,
            overflowX: 'auto'
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <Box sx={{ width: '100%' }}>
        <Footer />
        <CookieConsent />
      </Box>
    </Box>
  )

  return content
}
