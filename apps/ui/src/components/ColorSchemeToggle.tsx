import {
  IconButton,
  IconButtonProps,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from '@mui/material'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined'
import { useThemeContext } from 'themes/ThemeContext'
import type { ColorSchemePreference } from 'themes/useColorTheme'

/** Header button that flips between light and dark, for headers without an account menu. */
export const ColorSchemeToggle = ({ sx, ...props }: IconButtonProps) => {
  const { mode, toggleColorMode } = useThemeContext()
  const next = mode === 'light' ? 'dark' : 'light'
  const label = `Switch to ${next} mode`
  return (
    <Tooltip title={label}>
      <IconButton
        color="inherit"
        onClick={toggleColorMode}
        aria-label={label}
        sx={{
          border: 1,
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderRadius: 1,
          ...sx
        }}
        {...props}
      >
        {mode === 'light' ? (
          <DarkModeOutlinedIcon fontSize="small" />
        ) : (
          <LightModeOutlinedIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  )
}

const OPTIONS: {
  value: ColorSchemePreference
  label: string
  icon: React.ReactNode
}[] = [
  {
    value: 'light',
    label: 'Light',
    icon: <LightModeOutlinedIcon fontSize="small" />
  },
  {
    value: 'system',
    label: 'System',
    icon: <DesktopWindowsOutlinedIcon fontSize="small" />
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <DarkModeOutlinedIcon fontSize="small" />
  }
]

/** Light, system or dark, for the account menu. System follows the OS as it changes. */
export const ColorSchemeControl = () => {
  const { preference, setPreference } = useThemeContext()
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      size="small"
      aria-label="Color theme"
      value={preference}
      onChange={(_event, value: ColorSchemePreference | null) => {
        // Clicking the selected option again passes null; keep the choice
        if (value) setPreference(value)
      }}
    >
      {OPTIONS.map(({ value, label, icon }) => (
        <Tooltip
          key={value}
          title={label}
        >
          <ToggleButton
            value={value}
            aria-label={label}
            sx={{ py: 0.5 }}
          >
            {icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  )
}
