import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useDispatch } from 'react-redux'
import { setCredentials } from 'slices/authSlice'
import { useLoginMutation } from 'slices/authApiSlice'
import { Alert, AlertTitle, CircularProgress } from '@mui/material'
import Grid from '@mui/material/Grid'
import usePersist from 'hooks/usePersist'
import useTitle from 'hooks/useTitle'
import { describeLoginFailure, type LoginFailure } from './loginFailure'

const MagickLinkAuth = () => {
  useTitle('BilboMD: Check OTP')

  const { otp } = useParams()
  const [success, setSuccess] = useState(false)
  const [failure, setFailure] = useState<LoginFailure | null>(null)
  const [persist, setPersist] = usePersist()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [login, { isLoading }] = useLoginMutation()

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const authenticateOTP = async () => {
      if (!otp) {
        setFailure({ kind: 'rejected', message: 'No OTP provided' })
        return
      }
      try {
        const { accessToken } = await login({ otp }).unwrap()
        dispatch(setCredentials({ accessToken }))
        setSuccess(true)
        if (!persist) {
          setPersist(true)
        }
        timeoutId = setTimeout(() => {
          void navigate('../dashboard/jobs')
        }, 3000)
      } catch (err) {
        setFailure(describeLoginFailure(err))
      }
    }

    void authenticateOTP()
    return () => clearTimeout(timeoutId)
  }, [login, otp, persist, setPersist, navigate, dispatch])

  const content = (
    <Grid
      container
      columns={12}
      sx={{ height: '100vh', alignItems: 'center', justifyContent: 'center' }}
    >
      <Grid
        size={{ xs: 6 }}
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          border: 1,
          borderRadius: 1
        }}
      >
        {isLoading ? (
          <CircularProgress />
        ) : success ? (
          <Alert severity="success">
            <AlertTitle>Woot!</AlertTitle>Your OTP has been successfully
            validated. You will be forwarded to your dashboard in a few seconds.
          </Alert>
        ) : failure?.kind === 'rate_limited' ? (
          <Alert severity="error">
            <AlertTitle>Too many attempts</AlertTitle>
            {failure.message} You can also{' '}
            <Link to="../../magicklink">request a new MagickLink&#8482;</Link>.
          </Alert>
        ) : failure?.kind === 'unreachable' || failure?.kind === 'server' ? (
          <Alert severity="error">
            <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
            {failure.message} If this keeps happening please contact us.
          </Alert>
        ) : (
          <Alert severity="warning">
            <AlertTitle>Warning!</AlertTitle>Hmmmmm. Maybe your
            MagickLink&#8482; has expired? Please try{' '}
            <Link to="../../magicklink">generating another</Link>. If that
            doesn&apos;t work please contact us.
            <br />
            <p>{failure?.message}</p>
          </Alert>
        )}
      </Grid>
    </Grid>
  )

  return content
}

export default MagickLinkAuth
