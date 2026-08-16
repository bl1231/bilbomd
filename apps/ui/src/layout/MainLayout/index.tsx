import { useState } from 'react'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import PeopleIcon from '@mui/icons-material/People'
import {
  AddCircleOutlineOutlined,
  SubjectOutlined,
  AutoAwesome,
  InfoOutlined
} from '@mui/icons-material'
import SettingsIcon from '@mui/icons-material/Settings'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import SpeedIcon from '@mui/icons-material/Speed'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import useAuth from 'hooks/useAuth'
import Header from './Header'
import Breadcrumbs from './Breadcrumbs'
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

  const showBreadcrumbs = config.showBreadcrumbs?.toLowerCase() === 'true'
  const useNersc = config.useNersc?.toLowerCase() === 'true'
  const enableBilboMdSANS = config.enableBilboMdSANS?.toLowerCase() === 'true'
  const enableBilboMdMulti = config.enableBilboMdMulti?.toLowerCase() === 'true'
  const enableBilboMdScoper =
    config.enableBilboMdScoper?.toLowerCase() === 'true'

  const navigationGroup: NavMenuItem[] = [
    {
      text: 'Jobs',
      icon: <SubjectOutlined />,
      path: '/dashboard/jobs',
      onclick: () => navigate('dashboard/jobs'),
      roles: ['user', 'manager']
    }
  ]

  let jobFormsGroup: NavMenuItem[] = [
    {
      text: 'BilboMD Classic',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/classic',
      onclick: () => navigate('dashboard/jobs/classic'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD Auto',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/auto',
      onclick: () => navigate('dashboard/jobs/auto'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD AF',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/alphafold',
      onclick: () => navigate('dashboard/jobs/alphafold'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD OF3',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/openfold',
      onclick: () => navigate('dashboard/jobs/openfold'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD Multi',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/multimd',
      onclick: () => navigate('dashboard/jobs/multimd'),
      roles: ['user', 'manager']
    },
    {
      text: 'BilboMD SANS',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/sans',
      onclick: () => navigate('dashboard/jobs/sans'),
      roles: ['user', 'manager']
    },
    {
      text: 'Scoper',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/scoper',
      onclick: () => navigate('dashboard/jobs/scoper'),
      roles: ['user', 'manager']
    }
  ]

  if (useNersc || !enableBilboMdScoper) {
    jobFormsGroup = jobFormsGroup.filter((item) => item.text !== 'Scoper')
  }
  if (useNersc) {
    jobFormsGroup = jobFormsGroup.filter((item) => item.text !== 'BilboMD OF3')
  }
  if (!enableBilboMdSANS) {
    jobFormsGroup = jobFormsGroup.filter((item) => item.text !== 'BilboMD SANS')
  }
  if (!enableBilboMdMulti) {
    jobFormsGroup = jobFormsGroup.filter(
      (item) => item.text !== 'BilboMD Multi'
    )
  }

  const utilitiesGroup: NavMenuItem[] = [
    {
      text: 'inp Jiffy™',
      icon: <AutoAwesome />,
      path: '/dashboard/jobs/constinp',
      onclick: () => navigate('dashboard/jobs/constinp'),
      roles: ['user', 'manager']
    },
    {
      text: 'PAE Jiffy™',
      icon: <AutoAwesome />,
      path: '/dashboard/af2pae',
      onclick: () => navigate('dashboard/af2pae'),
      roles: ['user']
    }
  ]

  const infoGroup: NavMenuItem[] = [
    {
      text: 'Users',
      icon: <PeopleIcon />,
      path: '/dashboard/users',
      onclick: () => navigate('dashboard/users'),
      roles: ['admin']
    },
    {
      text: 'Admin',
      icon: <AdminPanelSettingsIcon />,
      path: '/admin',
      onclick: () => navigate('admin'),
      roles: ['admin']
    },
    {
      text: 'BullMQ',
      icon: <SpeedIcon />,
      endIcon: <OpenInNewIcon fontSize='inherit' />,
      path: '/admin/bullmq',
      onclick: () => window.open('/admin/bullmq', '_blank'),
      roles: ['admin']
    },
    {
      text: 'Help',
      icon: <HelpOutlineIcon />,
      path: '/dashboard/help',
      onclick: () => navigate('/dashboard/help'),
      roles: ['user']
    },
    {
      text: 'About',
      icon: <InfoOutlined />,
      path: '/dashboard/about',
      onclick: () => navigate('/dashboard/about'),
      roles: ['user']
    },
    {
      text: 'Settings',
      icon: <SettingsIcon />,
      path: '/settings',
      onclick: () => navigate('/settings'),
      roles: ['user']
    }
  ]

  const menuGroups = [
    navigationGroup,
    jobFormsGroup,
    utilitiesGroup,
    infoGroup
  ].filter((group) => group.length > 0)

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
          {showBreadcrumbs && <Breadcrumbs />}
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
