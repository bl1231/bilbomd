import { Box, Typography, Alert, Button } from '@mui/material'
import { useLocation, useNavigate } from 'react-router'

const REASON_MESSAGES: Record<string, string> = {
  no_primary_verified:
    'Your ORCID profile does not have a primary, verified email address. Please add one in your ORCID account settings and try again.',
  email_already_registered:
    'A BilboMD account already exists for the email on your ORCID profile, but it has not been linked to your ORCID iD. Please contact a BilboMD administrator to link your account.',
  token_exchange:
    'We could not verify the response from ORCID. Please return to the home page and try signing in again.',
  missing_id_token:
    'ORCID did not return the identity information we need. Please try signing in again.',
  userinfo_fetch:
    'We could not retrieve your ORCID profile. Please try signing in again in a few minutes.',
  finalize:
    'Something went wrong while completing your sign-in. Please try again.',
  session:
    'Your sign-in session expired. Please return to the home page and start again.'
}

const OrcidError = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const searchParams = new URLSearchParams(location.search)
  const reason = searchParams.get('reason') || 'unknown'
  const friendly = REASON_MESSAGES[reason]

  return (
    <Box sx={{ maxWidth: 'sm', mx: 'auto', mt: 8, textAlign: 'center' }}>
      <Alert
        severity='error'
        sx={{ mb: 3 }}
      >
        ORCID Authentication Failed
      </Alert>
      <Typography
        variant='body1'
        gutterBottom
      >
        Unfortunately, we couldn&apos;t complete your ORCID login.
      </Typography>
      {friendly ? (
        <Typography
          variant='body1'
          sx={{ mt: 2 }}
        >
          {friendly}
        </Typography>
      ) : (
        <Typography
          variant='body2'
          gutterBottom
        >
          Reason: <strong>{reason}</strong>
        </Typography>
      )}
      <Button
        variant='contained'
        sx={{ mt: 4 }}
        onClick={() => navigate('/')}
      >
        Return to Home
      </Button>
    </Box>
  )
}

export default OrcidError
