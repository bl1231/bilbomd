import { useState } from 'react'
import {
  Avatar,
  Box,
  ButtonBase,
  Divider,
  Menu,
  MenuItem,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useNavigate } from 'react-router'
import { ColorSchemeControl } from 'components/ColorSchemeToggle'
import LogOutDialog from 'features/auth/LogOut'
import { avatarColorFor, initialsFor } from './avatar'

interface UserMenuProps {
  displayName: string
  username: string
  email: string
  role: string
}

const MENU_LINKS = [
  { text: 'My Jobs', to: '/dashboard/jobs' },
  { text: 'Dashboard', to: '/dashboard' },
  { text: 'Settings', to: '/settings' }
]

/** The header's account button: who is logged in, the color theme, links and Log out. */
const UserMenu = ({ displayName, username, email, role }: UserMenuProps) => {
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const open = Boolean(anchorEl)
  const name = displayName || username

  const close = () => setAnchorEl(null)

  return (
    <>
      <ButtonBase
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-label={`Account: ${name} (${role})`}
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        sx={{
          gap: 1,
          py: 0.5,
          pl: 0.5,
          pr: 1,
          borderRadius: 999,
          color: 'inherit',
          textAlign: 'left',
          minWidth: 0,
          bgcolor: open ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
          '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
          '&.Mui-focusVisible': {
            outline: '2px solid rgba(255, 255, 255, 0.6)'
          }
        }}
      >
        <Avatar
          aria-hidden
          sx={{
            width: 32,
            height: 32,
            fontSize: '0.875rem',
            fontWeight: 600,
            bgcolor: avatarColorFor(name),
            color: '#fff'
          }}
        >
          {initialsFor(name)}
        </Avatar>
        {/* Below sm the avatar alone fits */}
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            flexDirection: 'column',
            minWidth: 0
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{ fontWeight: 600, lineHeight: 1.2, maxWidth: 200 }}
          >
            {name}
          </Typography>
          <Typography
            variant="caption"
            noWrap
            sx={{ lineHeight: 1.2, opacity: 0.75 }}
          >
            {role}
          </Typography>
        </Box>
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: 'transform 150ms',
            transform: open ? 'rotate(180deg)' : 'none'
          }}
        />
      </ButtonBase>
      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 240, mt: 1 } } }}
      >
        <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
          <ColorSchemeControl />
        </Box>
        <Typography
          component="div"
          variant="caption"
          noWrap
          title={email || username}
          sx={{ px: 2, pt: 0.5, pb: 0.5, color: 'text.secondary' }}
        >
          Signed in as {email || username}
        </Typography>
        {MENU_LINKS.map(({ text, to }) => (
          <MenuItem
            key={to}
            onClick={() => {
              close()
              void navigate(to)
            }}
          >
            {text}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            close()
            setLogoutOpen(true)
          }}
          sx={{ color: 'error.main' }}
        >
          Log out
        </MenuItem>
      </Menu>
      <LogOutDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
      />
    </>
  )
}

export default UserMenu
