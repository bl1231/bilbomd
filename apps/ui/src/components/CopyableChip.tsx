import React from 'react'
import { Chip, IconButton, Tooltip } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LaunchIcon from '@mui/icons-material/Launch'
import { Box } from '@mui/system'
import { green } from '@mui/material/colors'
import { alpha } from '@mui/material/styles'
import { useNavigate } from 'react-router'
import { useSnackbar } from 'notistack'

interface CopyableChipProps {
  label: string
  value?: string
  url?: string
}

const CopyableChip: React.FC<CopyableChipProps> = ({ label, value, url }) => {
  const navigate = useNavigate()
  const { enqueueSnackbar } = useSnackbar()

  const handleCopy = () => {
    if (value) {
      void navigator.clipboard.writeText(value)
      enqueueSnackbar(`${label} copied to clipboard!`, { variant: 'default' })
    }
  }

  const handleLaunch = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (url) {
      void navigate(url)
    }
  }

  return (
    <>
      <Chip
        label={
          <Box
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              maxWidth: '100%'
            }}
          >
            <Box
              component="span"
              sx={{
                mr: '6px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}
            >
              {value}
            </Box>
            <Tooltip title={`Copy ${label}`}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopy()
                }}
                sx={{ p: 0 }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {url && (
              <Tooltip title={`Go to ${url}`}>
                <IconButton
                  size="small"
                  onClick={handleLaunch}
                  sx={{ p: 0, ml: 1 }}
                >
                  <LaunchIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        }
        variant="outlined"
        sx={(theme) => ({
          fontSize: '0.80rem',
          fontFamily: 'monospace',
          borderColor: 'primary.main',
          // green[100] is too light behind dark mode's light text
          backgroundColor:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.success.main, 0.2)
              : green[100],
          maxWidth: '100%',
          minWidth: 0
        })}
      />
    </>
  )
}

export default CopyableChip
