import { useParams, Link as RouterLink } from 'react-router'
import { useSelector } from 'react-redux'
import { Alert, Box, Button, CircularProgress } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditUserForm from './EditUserForm'
import { useGetUsersQuery, selectUserById } from 'slices/usersApiSlice'
import useTitle from 'hooks/useTitle'
import type { RootState } from 'app/store'

const EditUser = () => {
  useTitle('BilboMD: Edit User')

  const { id } = useParams()

  // Populates the normalized users cache; the user itself comes from it.
  const { isLoading, isError, isSuccess } = useGetUsersQuery('usersList')
  const user = useSelector((state: RootState) => selectUserById(state, id!))

  if (user) return <EditUserForm user={user} />

  if (isLoading || (!isSuccess && !isError)) {
    return (
      <Box
        data-testid="spinner"
        sx={{ display: 'flex', justifyContent: 'center', p: 4 }}
      >
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Alert
        severity={isError ? 'error' : 'warning'}
        sx={{ mb: 2 }}
      >
        {isError
          ? 'An error occurred while fetching users.'
          : 'No user with that id exists. It may have been deleted.'}
      </Alert>
      <Button
        component={RouterLink}
        to="/dashboard/users"
        startIcon={<ArrowBackIcon />}
      >
        Back to users
      </Button>
    </Box>
  )
}

export default EditUser
