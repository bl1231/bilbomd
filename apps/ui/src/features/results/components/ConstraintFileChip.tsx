import React from 'react'
import { Box, Chip, IconButton, Tooltip } from '@mui/material'
import { green } from '@mui/material/colors'
import VisibilityIcon from '@mui/icons-material/Visibility'
import type { HasConstraintFile } from '../types'

interface ConstraintFileChipProps {
  job: HasConstraintFile
  onOpenModal?: () => void
}

export const ConstraintFileChip: React.FC<ConstraintFileChipProps> = ({
  job,
  onOpenModal
}) => (
  <Chip
    label={
      <Box style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '6px' }}>
          {job.const_inp_file || 'No constraint file'}
        </span>
        <Tooltip title={`Open ${job.const_inp_file || 'constraint file'}`}>
          <span>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onOpenModal?.()
              }}
              sx={{ padding: 0 }}
              disabled={!job.const_inp_file}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    }
    variant="outlined"
    sx={{
      fontSize: '0.875rem',
      borderColor: 'primary.main',
      backgroundColor: green[100],
      cursor: job.const_inp_file ? 'pointer' : 'default'
    }}
    onClick={job.const_inp_file ? onOpenModal : undefined}
  />
)
