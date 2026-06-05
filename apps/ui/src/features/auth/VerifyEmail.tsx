import { Alert, AlertTitle } from '@mui/material'
import Grid from '@mui/material/Grid'
import { axiosInstance } from 'app/api/axios'
import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router'
import Button from '@mui/material/Button'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import useTitle from 'hooks/useTitle'
import { logger } from 'utils/logger'

const VerifyEmail = () => {
  useTitle('BilboMD: Verify Email')
  const { code } = useParams()
  const isMountedRef = useRef(false) // Create a ref to track the initial mount
  const [verificationStatus, setVerificationStatus] = useState<
    'loading' | 'success' | 'failure'
  >('loading')

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await axiosInstance.post(
          '/verify',
          JSON.stringify({ code }),
          {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
          }
        )
        if (response.data.message === 'Verified') {
          setVerificationStatus('success')
        } else {
          setVerificationStatus('failure')
        }
      } catch (error) {
        logger.error('auth error: ', error)
        setVerificationStatus('failure')
      }
    }

    if (!isMountedRef.current) {
      // Only execute the effect on initial mount
      isMountedRef.current = true
      void verify()
    }
  }, [code])

  return (
    <Grid
      container
      columns={12}
      sx={{ height: '100vh', alignItems: 'center', justifyContent: 'center' }}
    >
      <Grid
        size={{ xs: 4 }}
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          border: 1,
          borderRadius: 1
        }}
      >
        {verificationStatus === 'loading' && (
          <Alert severity='info'>
            <AlertTitle>Verifying...</AlertTitle>
          </Alert>
        )}

        {verificationStatus === 'success' && (
          <Alert severity='success'>
            <AlertTitle>Woot! &#128640;</AlertTitle>
            Your email is verified. <br />
            Please login by obtaining a{' '}
            <Button
              sx={{ ml: 2 }}
              size='small'
              type='button'
              variant='contained'
              startIcon={<AutoFixHighIcon />}
              component={Link}
              to='../magicklink'
            >
              MagicLink &#8482;
            </Button>
          </Alert>
        )}

        {verificationStatus === 'failure' && (
          <Alert severity='warning'>
            <AlertTitle>Nope!</AlertTitle>
            Email Verification Failed.
            <br /> You may have used an outdated token. Please visit the{' '}
            <Link to='../login'>login</Link> page and try again.
          </Alert>
        )}
      </Grid>
    </Grid>
  )
}

export default VerifyEmail
