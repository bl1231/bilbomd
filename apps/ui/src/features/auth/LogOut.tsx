import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import { Button } from '@mui/material'
import useLogout from 'hooks/useLogout'

interface LogOutDialogProps {
  open: boolean
  onClose: () => void
}

/** Asks before logging out, since getting back in takes a new MagickLink. */
const LogOutDialog = ({ open, onClose }: LogOutDialogProps) => {
  const logout = useLogout()

  const onClickLogout = async () => {
    onClose()
    await logout()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
    >
      <DialogContent>
        <DialogContentText sx={{ color: 'text.primary' }}>
          Do you want to Logout?
        </DialogContentText>
        <DialogContentText>
          You will need to obtain a new MagickLink&#8482; to log back in.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          onClick={onClose}
        >
          Actually... Nevermind
        </Button>
        <Button
          variant="outlined"
          onClick={() => void onClickLogout()}
          autoFocus
        >
          Logout
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default LogOutDialog
