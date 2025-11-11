import { useEffect, useState } from 'react'
import { Button, Typography, Paper } from '@mui/material'

const COOKIE_KEY = 'bilbomd_cookie_consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const hasConsent = localStorage.getItem(COOKIE_KEY)
    if (!hasConsent) {
      setVisible(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem(COOKIE_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1300,
        backgroundColor: 'background.paper',
        px: 2,
        py: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: 1,
        borderColor: 'divider'
      }}
    >
      <Typography
        variant="body1"
        sx={{ mr: 2 }}
      >
        This website uses cookies to ensure proper functionality and improve
        your experience. See our{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        .
      </Typography>
      <Button
        variant="contained"
        size="small"
        onClick={handleAccept}
      >
        Accept
      </Button>
    </Paper>
  )
}
