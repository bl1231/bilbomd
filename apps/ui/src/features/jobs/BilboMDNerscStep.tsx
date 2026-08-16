import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import DirectionsRunRoundedIcon from '@mui/icons-material/DirectionsRunRounded'
import ErrorIcon from '@mui/icons-material/Error'
import { Chip, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import Tooltip from '@mui/material/Tooltip'
import { getStepDetails } from 'features/shared/stepDetails'

interface BilboMDStepProps {
  stepName: string
  stepStatus: string
  stepMessage: string
}

const BilboMDNerscStep = ({
  stepName,
  stepStatus,
  stepMessage
}: BilboMDStepProps) => {

  const { friendlyName, tooltipMessage } = getStepDetails(stepName)
  return (
    <Grid
      key={stepName}
      sx={{
        m: 0.5,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.5
      }}
    >
      <Grid sx={{ flexShrink: 0 }}>
        <Tooltip
          title={tooltipMessage}
          arrow
        >
          <Chip
            icon={
              stepStatus === 'Waiting' ? (
                <RadioButtonUncheckedIcon />
              ) : stepStatus === 'Running' ? (
                <DirectionsRunRoundedIcon style={{ color: 'black' }} />
              ) : stepStatus === 'Success' ? (
                <CheckCircleIcon />
              ) : stepStatus === 'Error' ? (
                <ErrorIcon />
              ) : undefined
            }
            size="small"
            label={friendlyName}
            color={
              stepStatus === 'Success'
                ? 'success'
                : stepStatus === 'Error'
                  ? 'error'
                  : undefined
            }
            style={
              stepStatus === 'Running'
                ? { backgroundColor: '#fff566', color: 'black' }
                : undefined
            }
          />
        </Tooltip>
      </Grid>
      <Grid sx={{ minWidth: 0, flex: '1 1 220px' }}>
        <Typography variant="body2">{stepMessage || 'Waiting'}</Typography>
      </Grid>
    </Grid>
  )
}

export default BilboMDNerscStep
