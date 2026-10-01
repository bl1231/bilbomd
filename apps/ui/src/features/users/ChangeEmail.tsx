import { useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import useAuth from 'hooks/useAuth'
import useLogout from 'hooks/useLogout'
import {
  useUpdateEmailMutation,
  useVerifyOtpMutation,
  useResendOtpMutation
} from 'slices/userAccountApiSlice'
import SettingsSection from './SettingsSection'
import { getOrcidId } from './orcid'

interface ApiError {
  status?: number
  data?: { message?: string }
}

type Feedback = { severity: 'success' | 'error'; message: string } | null

const emailSchema = Yup.object({
  newEmail: Yup.string()
    .email('Invalid email address')
    .required('New email address is required')
})

const otpSchema = Yup.object({
  otp: Yup.string()
    .required('Code is required')
    .length(6, 'Code must be 6 characters long')
})

const errorMessage = (error: unknown, fallback: string) => {
  const { status, data } = error as ApiError
  if (status === 409)
    return 'This email is already associated with another account.'
  if (status === 400 && data?.message) return data.message
  return fallback
}

const ChangeEmail = () => {
  const { username, email } = useAuth()
  const logout = useLogout()
  const [updateEmail] = useUpdateEmailMutation()
  const [verifyOtp] = useVerifyOtpMutation()
  const [resendOtp] = useResendOtpMutation()
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // ORCID sign-in finds the account by the email on the ORCID record, so
  // changing it here would break the next ORCID sign-in.
  if (getOrcidId(username)) {
    return (
      <SettingsSection title="Email">
        <Typography gutterBottom>{email}</Typography>
        <Alert severity="info">
          You sign in with ORCID, so your BilboMD email comes from your ORCID
          record. Changing it here isn&#39;t supported yet. Contact BilboMD
          support at <strong>bilbomd@lbl.gov</strong> if you need it changed.
        </Alert>
      </SettingsSection>
    )
  }

  const handleSendCode = async (values: { newEmail: string }) => {
    setFeedback(null)
    try {
      await updateEmail({
        username,
        currentEmail: email,
        newEmail: values.newEmail
      }).unwrap()
      setPendingEmail(values.newEmail)
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: errorMessage(
          error,
          'Could not send a code to that address. Please try again.'
        )
      })
    }
  }

  const handleVerify = async (values: { otp: string }) => {
    if (!pendingEmail) return
    setFeedback(null)
    try {
      await verifyOtp({
        username,
        currentEmail: email,
        newEmail: pendingEmail,
        otp: values.otp
      }).unwrap()
      setFeedback({
        severity: 'success',
        message:
          'Your email address is updated. Signing you out so you can sign in with the new address.'
      })
      setTimeout(() => void logout(), 3000)
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: errorMessage(error, 'Could not verify the code.')
      })
    }
  }

  const handleResend = async () => {
    if (!pendingEmail) return
    setFeedback(null)
    try {
      await resendOtp({
        username,
        currentEmail: email,
        newEmail: pendingEmail
      }).unwrap()
      setFeedback({ severity: 'success', message: 'We sent a new code.' })
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: errorMessage(error, 'Could not send a new code.')
      })
    }
  }

  return (
    <SettingsSection
      title="Email"
      description="We send sign-in codes and job notifications to this address."
    >
      <Typography sx={{ mb: 2 }}>
        Current email: <strong>{email}</strong>
      </Typography>

      {pendingEmail ? (
        <Formik
          initialValues={{ otp: '' }}
          validationSchema={otpSchema}
          onSubmit={handleVerify}
        >
          {({ isSubmitting }) => (
            <Form>
              <Typography sx={{ mb: 2 }}>
                Enter the 6-character code we sent to{' '}
                <strong>{pendingEmail}</strong>.
              </Typography>
              <Field
                as={TextField}
                fullWidth
                label="Code"
                name="otp"
                autoComplete="one-time-code"
                helperText={<ErrorMessage name="otp" />}
                sx={{ mb: 2 }}
              />
              <Stack
                direction="row"
                spacing={1}
              >
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSubmitting}
                >
                  Verify code
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => void handleResend()}
                >
                  Send a new code
                </Button>
                <Button
                  onClick={() => {
                    setPendingEmail(null)
                    setFeedback(null)
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            </Form>
          )}
        </Formik>
      ) : (
        <Formik
          initialValues={{ newEmail: '' }}
          validationSchema={emailSchema}
          onSubmit={handleSendCode}
        >
          {({ isSubmitting }) => (
            <Form noValidate>
              <Field
                as={TextField}
                fullWidth
                label="New email address"
                name="newEmail"
                type="email"
                helperText={<ErrorMessage name="newEmail" />}
                sx={{ mb: 2 }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
              >
                Send verification code
              </Button>
            </Form>
          )}
        </Formik>
      )}

      {feedback && (
        <Box sx={{ mt: 2 }}>
          <Alert severity={feedback.severity}>{feedback.message}</Alert>
        </Box>
      )}
    </SettingsSection>
  )
}

export default ChangeEmail
