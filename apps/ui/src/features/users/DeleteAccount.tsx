import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography
} from '@mui/material'
import useAuth from 'hooks/useAuth'
import useLogout from 'hooks/useLogout'
import { useDeleteUserByUserNameMutation } from 'slices/userAccountApiSlice'
import SettingsSection from './SettingsSection'

interface ApiError {
  status?: number
  data?: { message?: string }
}

const DeleteAccount = () => {
  const { username } = useAuth()
  const logout = useLogout()
  const [deleteAccount, { isLoading }] = useDeleteUserByUserNameMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    try {
      await deleteAccount(username).unwrap()
      setDeleted(true)
      setTimeout(() => void logout(), 3000)
    } catch (err) {
      const { status, data } = err as ApiError
      setError(
        status === 409 && data?.message
          ? data.message
          : 'Could not delete your account. Please try again or contact BilboMD support at bilbomd@lbl.gov.'
      )
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <SettingsSection title="Delete account">
      {deleted ? (
        <Alert severity="success">
          Your account is deleted. Signing you out.
        </Alert>
      ) : (
        <>
          <Typography gutterBottom>Deleting your account:</Typography>
          <Box
            component="ul"
            sx={{ mt: 0, mb: 2, pl: 3 }}
          >
            <li>signs you out and stops you from signing in again</li>
            <li>removes your name and email address</li>
            <li>revokes your API tokens</li>
            <li>
              keeps your job history, with your name and email removed, for
              usage statistics
            </li>
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            You can create a new account later with the same email address. Wait
            for any queued or running jobs to finish first.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setConfirmOpen(true)}
          >
            Delete account
          </Button>
          {error && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
            >
              {error}
            </Alert>
          )}
        </>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You can&#39;t undo this. You will be signed out right away.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={isLoading}
            onClick={() => void handleConfirm()}
          >
            Delete my account
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsSection>
  )
}

export default DeleteAccount
