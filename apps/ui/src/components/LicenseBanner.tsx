import Alert from '@mui/material/Alert'
import { useGetConfigsQuery, ConfigLicense } from 'slices/configsApiSlice'

/**
 * Warns when the BilboMD installation has no valid license. Job submission is
 * blocked server-side in that case (see the backend requireValidLicense
 * middleware); this banner makes the reason visible on every page. Renders
 * nothing when the license is valid or config hasn't loaded yet.
 */
const LicenseBanner = () => {
  const { data: config } = useGetConfigsQuery('configData')
  const license = config?.license as unknown as ConfigLicense | undefined

  if (!license || license.status === 'valid') return null

  const message =
    license.status === 'expired'
      ? `The BilboMD license${license.licensee ? ` for ${license.licensee}` : ''} expired${license.expiresAt ? ` on ${new Date(license.expiresAt).toLocaleDateString()}` : ''}. Job submission is disabled until it is renewed.`
      : 'This BilboMD installation is unlicensed. Job submission is disabled until a valid license is installed.'

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
    >
      {message}
    </Alert>
  )
}

export default LicenseBanner
