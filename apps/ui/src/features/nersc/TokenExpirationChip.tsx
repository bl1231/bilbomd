import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import {
  formatDistanceToNow,
  isBefore,
  subDays,
  subWeeks
} from 'date-fns'
import { formatDateSafe, parseDateSafe } from 'utils/dates'
import { useGetSfapiClientExpirationQuery } from 'slices/nerscApiSlice'

const TokenExpirationChip = () => {
  const now = new Date()
  const { data, isLoading } = useGetSfapiClientExpirationQuery()

  if (isLoading) return <div>Loading...</div>

  // The expiration is fetched live from the Superfacility API. If the request
  // failed (e.g. the client has already expired and can no longer authenticate),
  // data is undefined and the chip falls back to "Expires: unknown".
  const expirationDate = parseDateSafe(data?.expiresAt)

  let chipColor: string
  let chipLabel: string

  if (!expirationDate) {
    chipColor = 'gray'
    chipLabel = 'Expires: unknown'
  } else {
    chipLabel = `Expires in ${formatDistanceToNow(expirationDate)}`

    if (isBefore(expirationDate, now)) {
      chipColor = 'red'
      chipLabel = 'Expired'
    } else {
      const twoDaysBeforeExp = subDays(expirationDate, 2)
      const oneWeekBeforeExp = subWeeks(expirationDate, 1)

      if (!isBefore(now, twoDaysBeforeExp)) {
        chipColor = 'darkorange' // within 2 days
      } else if (!isBefore(now, oneWeekBeforeExp)) {
        chipColor = 'orange' // within 1 week
      } else {
        chipColor = 'green' // more than 1 week away
      }
    }
  }

  return (
    <Grid sx={{ m: 1, display: 'flex', alignItems: 'center' }}>
      <Typography>
        <b>Superfacility API Token</b>:
      </Typography>
      <Chip
        sx={{ mx: 1 }}
        label={chipLabel}
        style={{ backgroundColor: chipColor, color: 'white' }}
      />
      <Typography>
        <b>Expiration Date :</b>{' '}
        <span style={{ fontSize: '1.0rem' }}>
          {formatDateSafe(expirationDate, 'MMMM d, yyyy h:mm a', 'Unknown')}
        </span>
      </Typography>
    </Grid>
  )
}

export default TokenExpirationChip
