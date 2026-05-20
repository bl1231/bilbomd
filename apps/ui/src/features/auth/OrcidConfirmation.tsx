import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Typography
} from '@mui/material'
import {
  useGetOrcidSessionQuery,
  useFinalizeOrcidMutation
} from '../../slices/authApiSlice'
import { userDisplayName } from 'utils/userDisplayName'

interface ProfileRowProps {
  label: string
  value: string
}

const ProfileRow = ({ label, value }: ProfileRowProps) => (
  <Box>
    <Typography
      variant='caption'
      color='text.secondary'
      sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
    >
      {label}
    </Typography>
    <Typography
      variant='body1'
      sx={{ fontFamily: 'inherit' }}
    >
      {value || '—'}
    </Typography>
  </Box>
)

export default function OrcidConfirmation() {
  const { data: profile, isLoading, isError } = useGetOrcidSessionQuery(undefined)
  const [finalizeOrcid, { isLoading: isFinalizing }] = useFinalizeOrcidMutation()

  if (isLoading) return <Typography>Loading…</Typography>
  if (isError || !profile) {
    window.location.href = '/auth/orcid-error?reason=session'
    return null
  }

  const displayName = userDisplayName({
    firstName: profile.givenName,
    lastName: profile.familyName
  })
  const internalAccountId = `orcid-${profile.orcidId}`

  const handleConfirm = async () => {
    try {
      await finalizeOrcid({}).unwrap()
      window.location.href = '/welcome'
    } catch (err) {
      console.error(err)
      window.location.href = '/auth/orcid-error?reason=finalize'
    }
  }

  return (
    <Container maxWidth='sm'>
      <Paper sx={{ padding: 3, marginTop: 4 }}>
        <Typography
          variant='h5'
          gutterBottom
        >
          Confirm your ORCID profile
        </Typography>
        <Typography
          variant='body2'
          color='text.secondary'
          sx={{ mb: 3 }}
        >
          BilboMD will create a new account using the verified information
          below. Nothing on this page is editable here — to change any of
          these values, update them in your ORCID account and sign in again.
        </Typography>

        <Stack
          spacing={2}
          divider={<Divider flexItem />}
        >
          <ProfileRow
            label='First name'
            value={profile.givenName}
          />
          <ProfileRow
            label='Last name'
            value={profile.familyName}
          />
          <ProfileRow
            label='Email'
            value={profile.email}
          />
          <ProfileRow
            label='ORCID iD'
            value={profile.orcidId}
          />
          <ProfileRow
            label='BilboMD display name'
            value={displayName}
          />
          <ProfileRow
            label='BilboMD account ID'
            value={internalAccountId}
          />
        </Stack>

        <Button
          type='button'
          variant='contained'
          color='primary'
          onClick={handleConfirm}
          disabled={isFinalizing}
          sx={{ mt: 3 }}
          fullWidth
        >
          {isFinalizing ? 'Creating account…' : 'Confirm and Continue'}
        </Button>
      </Paper>
    </Container>
  )
}
