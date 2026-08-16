import React from 'react'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Toolbar from '@mui/material/Toolbar'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import { useTheme, Divider } from '@mui/material'
import { useLocation } from 'react-router'

const drawerWidth = 190

export interface NavMenuItem {
  text: string
  icon: React.ReactNode
  path: string
  onclick: () => void
  roles: string[]
  endIcon?: React.ReactNode
  /** Omit this item from the mobile (temporary) drawer */
  hideOnMobile?: boolean
}

interface NavDrawerProps {
  menuGroups: NavMenuItem[][]
  isAdmin: boolean
  mobileOpen: boolean
  onMobileClose: () => void
}

const NavDrawer = ({
  menuGroups,
  isAdmin,
  mobileOpen,
  onMobileClose
}: NavDrawerProps) => {
  const location = useLocation()
  const theme = useTheme()

  const buttonContent = (closeOnNavigate: boolean) => {
    const groups = closeOnNavigate
      ? menuGroups
          .map((group) => group.filter((item) => !item.hideOnMobile))
          .filter((group) => group.length > 0)
      : menuGroups
    return buttonGroups(groups, closeOnNavigate)
  }

  const buttonGroups = (groups: NavMenuItem[][], closeOnNavigate: boolean) => (
    <>
      {groups.map((group, groupIndex) => (
        <React.Fragment key={groupIndex}>
          {group.map((item) => (
            <ListItem
              key={item.text}
              disablePadding
            >
              <ListItemButton
                onClick={() => {
                  item.onclick()
                  if (closeOnNavigate) onMobileClose()
                }}
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
                {item.endIcon}
              </ListItemButton>
            </ListItem>
          ))}
          {groupIndex < groups.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </>
  )

  return (
    <>
      {/* Desktop: permanent drawer alongside the content */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
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
          <List>{buttonContent(false)}</List>
        </Box>
      </Drawer>

      {/* Mobile: temporary drawer toggled from the Header hamburger */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box'
          }
        }}
      >
        {/* Spacer so items start below the fixed 70px AppBar */}
        <Box sx={{ height: '70px', flexShrink: 0 }} />
        <Box sx={{ overflow: 'auto' }}>
          <List>{buttonContent(true)}</List>
        </Box>
      </Drawer>
    </>
  )
}

export default NavDrawer
