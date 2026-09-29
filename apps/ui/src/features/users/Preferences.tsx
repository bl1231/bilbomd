import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Switch,
  Typography
} from '@mui/material'
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation
} from 'slices/userAccountApiSlice'

const Preferences = () => {
  const { data, isLoading, isError } = useGetPreferencesQuery()
  const [updatePreferences, { isLoading: isSaving, isError: saveFailed }] =
    useUpdatePreferencesMutation()

  if (isLoading) return <CircularProgress size={24} />
  if (isError || !data) {
    return <Alert severity="error">Could not load your preferences.</Alert>
  }

  return (
    <Box>
      <Typography
        variant="h6"
        gutterBottom
      >
        Email notifications
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={data.emailNotifications}
            disabled={isSaving}
            onChange={(_event, checked) =>
              updatePreferences({ emailNotifications: checked })
            }
          />
        }
        label="Email me when my jobs complete or fail"
      />
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1 }}
      >
        Sign-in codes, magic links, and account changes are always emailed.
      </Typography>
      {saveFailed && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
        >
          Could not save your preference. Please try again.
        </Alert>
      )}
    </Box>
  )
}

export default Preferences
