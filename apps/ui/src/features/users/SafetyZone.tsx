import { Typography, Alert, Button } from '@mui/material'

const SafetyZone = () => {
  const handleContactSupport = () => {
    console.log('Contacting support for account deletion')
    window.location.href = 'mailto:bilbomd@lbl.gov'
  }

  return (
    <Alert severity="info">
      <Typography variant="h6">
        This feature isn&#39;t implemented yet. If you want to delete your
        account, please contact BilboMD Support at{' '}
        <strong>bilbomd@lbl.gov</strong>
      </Typography>
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        onClick={handleContactSupport}
      >
        Contact Support
      </Button>
    </Alert>
  )
}

export default SafetyZone
