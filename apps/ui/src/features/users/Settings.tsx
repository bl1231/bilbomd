import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Toolbar,
  Button
} from '@mui/material'
import UserAvatar from './UserAvatar'
import { useNavigate, Outlet, useLocation } from 'react-router'
import useAuth from 'hooks/useAuth'
import PersonIcon from '@mui/icons-material/Person'
import NotificationsIcon from '@mui/icons-material/Notifications'
import EmailIcon from '@mui/icons-material/Email'
import ApiIcon from '@mui/icons-material/Api'
import PersonOffIcon from '@mui/icons-material/PersonOff'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

const drawerWidth = 190

// /settings/preferences is linked from job emails, so keep that path.
const settingsMenu = [
  { text: 'Profile', path: '/settings/profile', icon: <PersonIcon /> },
  {
    text: 'Notifications',
    path: '/settings/preferences',
    icon: <NotificationsIcon />
  },
  { text: 'Email', path: '/settings/email', icon: <EmailIcon /> },
  { text: 'API Tokens', path: '/settings/api-tokens', icon: <ApiIcon /> },
  {
    text: 'Delete account',
    path: '/settings/delete-account',
    icon: <PersonOffIcon />
  }
]

const SettingsLayout = () => {
  const user = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: '24px' // offset for fixed Header
          }
        }}
      >
        <Toolbar />
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard')}
          sx={{ width: 'calc(100% - 16px)', mx: 1, mb: 1 }}
        >
          Dashboard
        </Button>
        <UserAvatar
          displayName={user.displayName}
          email={user.email}
          status={user.status}
        />
        <List>
          {settingsMenu.map(({ text, path, icon }) => (
            <ListItem
              key={text}
              disablePadding
            >
              <ListItemButton
                selected={
                  location.pathname === path ||
                  (path === '/settings/profile' &&
                    location.pathname === '/settings')
                }
                onClick={() => navigate(path)}
              >
                <ListItemIcon>{icon}</ListItemIcon>
                <ListItemText
                  primary={text}
                  sx={{ ml: 1 }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3 }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}

export default SettingsLayout
