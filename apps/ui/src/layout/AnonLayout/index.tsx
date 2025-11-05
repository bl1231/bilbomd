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

  if (configIsLoading) return <CircularProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration data</Alert>
  if (!config)
    return <Alert severity="warning">No configuration data available</Alert>

  const useNersc = config.useNersc?.toLowerCase() === 'true'
  const enableBilboMdSANS = config.enableBilboMdSANS?.toLowerCase() === 'true'

  let menuItems = [
    {
      text: 'BilboMD Classic',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/classic/new',
      onclick: () => navigate('jobs/classic/new'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD Auto',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/auto/new',
      onclick: () => navigate('jobs/auto/new'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD AF',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/alphafold/new',
      onclick: () => navigate('jobs/alphafold/new'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'BilboMD SANS',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/sans/new',
      onclick: () => navigate('jobs/sans/new'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'Scoper',
      icon: <AddCircleOutlineOutlined />,
      path: '/jobs/scoper/new',
      onclick: () => navigate('jobs/scoper/new'),
      roles: ['user', 'manager'],
      divider: true
    },
    {
      text: 'inp Jiffy™',
      icon: <AutoAwesome />,
      path: '/jiffy/inp',
      onclick: () => navigate('jiffy/inp'),
      roles: ['user', 'manager'],
      divider: false
    },
    {
      text: 'PAE Jiffy™',
      icon: <AutoAwesome />,
      path: '/jiffy/pae',
      onclick: () => navigate('jiffy/pae'),
      roles: ['user'],
      divider: false
    },
    {
      text: 'Help',
      icon: <InfoOutlined />,
      path: '/help',
      onclick: () => navigate('/help'),
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
