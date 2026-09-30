import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import DirectionsRunRoundedIcon from '@mui/icons-material/DirectionsRunRounded'
import ErrorIcon from '@mui/icons-material/Error'
import { Chip, Typography } from '@mui/material'
import type { SvgIconProps } from '@mui/material'
import Grid from '@mui/material/Grid'
import Tooltip from '@mui/material/Tooltip'
import { getStepDetails } from 'features/shared/stepDetails'
import { RUNNING_STEP_BACKGROUND } from 'features/shared/StatusColors'

// The icon for each step status, shared with the job page's step strip
export const StepStatusIcon = ({
  status,
  ...props
}: { status: string } & SvgIconProps) => {
  switch (status) {
    case 'Waiting':
      return <RadioButtonUncheckedIcon {...props} />
    case 'Running':
      return (
        <DirectionsRunRoundedIcon
          {...props}
          style={{ color: 'black', ...props.style }}
        />
      )
    case 'Success':
      return <CheckCircleIcon {...props} />
    case 'Error':
      return <ErrorIcon {...props} />
    default:
      return null
  }
}

interface BilboMDStepProps {
  stepName: string
  stepStatus: string
  stepMessage: string
  duration?: string
}

const BilboMDNerscStep = ({
  stepName,
  stepStatus,
  stepMessage,
  duration
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
            icon={<StepStatusIcon status={stepStatus} />}
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
                ? { backgroundColor: RUNNING_STEP_BACKGROUND, color: 'black' }
                : undefined
            }
          />
        </Tooltip>
      </Grid>
      <Grid sx={{ minWidth: 0, flex: '1 1 220px' }}>
        <Typography variant="body2">{stepMessage || 'Waiting'}</Typography>
      </Grid>
      {duration && (
        <Grid sx={{ flexShrink: 0 }}>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary' }}
          >
            ⏱ {duration}
          </Typography>
        </Grid>
      )}
    </Grid>
  )
}

export default BilboMDNerscStep
