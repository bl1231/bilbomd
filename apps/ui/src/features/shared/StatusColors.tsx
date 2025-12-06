import { JobStatusEnum } from '@bilbomd/mongodb-schema/frontend'
import { Theme } from '@mui/material/styles'

export const getStatusColors = (status: JobStatusEnum, theme: Theme) => {
  const statusColors: Record<
    JobStatusEnum,
    { background: string; text: string }
  > = {
    Submitted: {
      background: '#d6e4ff',
      text: theme.palette.mode === 'light' ? 'black' : 'white'
    },
    Pending: {
      background: '#d6e4ff',
      text: theme.palette.mode === 'light' ? 'black' : 'white'
    },
    Running: {
      background: '#fff566',
      text: theme.palette.mode === 'light' ? 'black' : 'black'
    },
    Completed: {
      background: '#73d13d',
      text: theme.palette.mode === 'light' ? 'black' : 'black'
    },
    Error: {
      background: 'red',
      text: 'white'
    },
    Failed: {
      background: 'red',
      text: 'white'
    },
    Cancelled: {
      background: '#d6e4ff',
      text: theme.palette.mode === 'light' ? 'black' : 'white'
    }
  }

  // Check if status is defined and exists in the statusColors object.
  if (status in statusColors) {
    return statusColors[status]
  }

  // Default background and text colors
  return {
    background: '#d6e4ff',
    text: theme.palette.mode === 'light' ? 'black' : 'white'
  }
}
