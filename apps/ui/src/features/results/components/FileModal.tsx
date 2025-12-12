import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
  Box,
  Tooltip,
  IconButton,
  Typography
} from '@mui/material'
import { green } from '@mui/material/colors'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CloseIcon from '@mui/icons-material/Close'

interface FileModalProps {
  open: boolean
  onClose: () => void
  fileContents?: string
  isLoading: boolean
  error?: Error | string | null
  onCopyToClipboard: () => void
}

export const FileModal: React.FC<FileModalProps> = ({
  open,
  onClose,
  fileContents,
  isLoading,
  error,
  onCopyToClipboard
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    fullWidth
    maxWidth="md"
    sx={{
      '& .MuiPaper-root': {
        backgroundColor: green[100],
        color: 'black'
      }
    }}
  >
    <DialogTitle>
      CHARMM Constraint File
      <Tooltip title="Copy to clipboard">
        <IconButton
          aria-label="copy-constraint-file"
          onClick={onCopyToClipboard}
          sx={{
            position: 'absolute',
            right: 64,
            top: 16
          }}
        >
          <ContentCopyIcon />
        </IconButton>
      </Tooltip>
    </DialogTitle>
    <IconButton
      aria-label="close"
      onClick={onClose}
      sx={(theme) => ({
        position: 'absolute',
        right: 16,
        top: 16,
        color: theme.palette.grey[500]
      })}
    >
      <CloseIcon />
    </IconButton>
    <DialogContent>
      {isLoading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px'
          }}
        >
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">Failed to load file contents.</Typography>
      ) : (
        <Typography
          component="pre"
          sx={{
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontFamily: 'monospace'
          }}
        >
          {fileContents || 'No content available.'}
        </Typography>
      )}
    </DialogContent>
  </Dialog>
)
