import React, { useState, useEffect } from 'react'
import { Typography, Box, CircularProgress } from '@mui/material'

const License: React.FC = () => {
  const [licenseText, setLicenseText] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLicense = async () => {
      try {
        const response = await fetch('/LICENSE.txt')
        if (!response.ok) {
          throw new Error('Failed to load license')
        }
        const text = await response.text()
        setLicenseText(text)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void fetchLicense()
  }, [])

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <Typography color="error">Error loading license: {error}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="h4"
        gutterBottom
      >
        License
      </Typography>
      <Typography
        component="pre"
        sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
      >
        {licenseText}
      </Typography>
    </Box>
  )
}

export default License
