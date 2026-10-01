import { Alert, AlertTitle, Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SubmitError } from 'utils/submitError'

interface SubmitErrorAlertProps {
  error: SubmitError | null
  sx?: SxProps<Theme>
}

const SubmitErrorAlert = ({ error, sx }: SubmitErrorAlertProps) => {
  if (!error) return null
  if (error.details.length === 0) {
    return (
      <Alert
        severity="error"
        sx={sx}
      >
        {error.message}
      </Alert>
    )
  }
  return (
    <Alert
      severity="error"
      sx={sx}
    >
      <AlertTitle>{error.message}</AlertTitle>
      <Box
        component="ul"
        sx={{ m: 0, pl: 2.5 }}
      >
        {error.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </Box>
    </Alert>
  )
}

export default SubmitErrorAlert
