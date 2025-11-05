import React from 'react'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Toolbar from '@mui/material/Toolbar'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import { useTheme, Divider } from '@mui/material'

import {
  AddCircleOutlineOutlined,
  AutoAwesome,
  InfoOutlined
} from '@mui/icons-material'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import useAuth from 'hooks/useAuth'
import Header from './Header'
import Breadcrumbs from './Breadcrumbs'
import Footer from './Footer'

const drawerWidth = 190

export default function ClippedDrawer() {
  const { isAdmin } = useAuth()
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isSettingsPage = location.pathname.startsWith('/settings')
  const showBreadcrumbs = config?.showBreadcrumbs?.toLowerCase() === 'true'

  if (configIsLoading) return <CircularProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration data</Alert>
  if (!config)
    return <Alert severity="warning">No configuration data available</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'
  const enableBilboMdSANS = config.enableBilboMdSANS?.toLowerCase() === 'true'
  const enableBilboMdMulti = config.enableBilboMdMulti?.toLowerCase() === 'true'

  let menuItems = [
    {
      text: 'BilboMD Classic',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/classic',
      onclick: () => navigate('dashboard/jobs/classic'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD Auto',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/auto',
      onclick: () => navigate('dashboard/jobs/auto'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD AF',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/alphafold',
      onclick: () => navigate('dashboard/jobs/alphafold'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD Multi',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/multimd',
      onclick: () => navigate('dashboard/jobs/multimd'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD SANS',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/sans',
      onclick: () => navigate('dashboard/jobs/sans'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'Scoper',
      icon: <AddCircleOutlineOutlined />,
      path: '/dashboard/jobs/scoper',
      onclick: () => navigate('dashboard/jobs/scoper'),
      roles: ['user', 'manager'],
      divider: true
    },
    {
      text: 'inp Jiffy™',
      icon: <AutoAwesome />,
      path: '/dashboard/jobs/constinp',
      onclick: () => navigate('dashboard/jobs/constinp'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'PAE Jiffy™',
      icon: <AutoAwesome />,
      path: '/dashboard/af2pae',
      onclick: () => navigate('dashboard/af2pae'),
      roles: ['user'],
      divider: false
    },
    {
      text: 'About',
      icon: <InfoOutlined />,
      path: '/dashboard/about',
      onclick: () => navigate('/dashboard/about'),
      roles: ['user'],
      divider: false
    }
  ]

  if (useNersc) {
    menuItems = menuItems.filter((item) => item.text !== 'Scoper')
  }

  if (!enableBilboMdSANS) {
    menuItems = menuItems.filter((item) => item.text !== 'BilboMD SANS')
  }

  if (!enableBilboMdMulti) {
    menuItems = menuItems.filter((item) => item.text !== 'BilboMD Multi')
  }

  const buttonContent = (
    <>
      {menuItems.map((item) => (
        <React.Fragment key={item.text}>
          <ListItem disablePadding>
            <ListItemButton
              onClick={item.onclick}
              sx={{
                backgroundColor:
                  location.pathname === item.path
                    ? theme.palette.mode === 'light'
                      ? theme.palette.grey[200]
                      : theme.palette.grey[600]
                    : null,
                display:
                  item.roles.includes('admin') && !isAdmin ? 'none' : 'flex'
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText sx={{ ml: 1 }}>{item.text}</ListItemText>
            </ListItemButton>
          </ListItem>
          {item.divider && <Divider />}
        </React.Fragment>
      ))}
    </>
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
        <Header />
      </Box>

      <Box sx={{ display: 'flex', flexGrow: 1 }}>
        {!isSettingsPage && (
          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              [`& .MuiDrawer-paper`]: {
                width: drawerWidth,
                boxSizing: 'border-box',
                top: '24px'
              }
            }}
          >
            <Toolbar />
            <Box sx={{ overflow: 'auto' }}>
              <List>{buttonContent}</List>
            </Box>
          </Drawer>
        )}
        <Box
          component="main"
          sx={{ flexGrow: 1, p: 3 }}
        >
          {showBreadcrumbs && <Breadcrumbs />}
          <Outlet />
        </Box>
      </Box>

      <Box sx={{ width: '100vw' }}>
        <Footer />
      </Box>
    </Box>
  )

  return content
}
