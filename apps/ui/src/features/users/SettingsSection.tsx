import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

interface SettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
}

const SettingsSection = ({
  title,
  description,
  children
}: SettingsSectionProps) => (
  <Box sx={{ maxWidth: 720 }}>
    <Typography
      variant="h5"
      component="h1"
      gutterBottom
    >
      {title}
    </Typography>
    {description && (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2 }}
      >
        {description}
      </Typography>
    )}
    <Paper
      variant="outlined"
      sx={{ p: 2 }}
    >
      {children}
    </Paper>
  </Box>
)

export default SettingsSection
