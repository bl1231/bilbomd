import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import DirectionsRunRoundedIcon from '@mui/icons-material/DirectionsRunRounded'
import ErrorIcon from '@mui/icons-material/Error'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import { Chip, Typography } from '@mui/material'
import type { SvgIconProps } from '@mui/material'
import { alpha } from '@mui/material/styles'
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
  // Reserve the duration column even when this step has no time, so chips
  // line up with steps that do
  showDurationColumn?: boolean
}

const BilboMDNerscStep = ({
  stepName,
  stepStatus,
  stepMessage,
  duration,
  showDurationColumn = !!duration
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
      {showDurationColumn && (
        <Grid
          data-testid={`step-duration-${stepName}`}
          sx={{ flexShrink: 0, width: 120 }}
        >
          {duration && (
            <Chip
              size="small"
              icon={<TimerOutlinedIcon />}
              label={duration}
              sx={(theme) => ({
                width: '100%',
                // Stopwatch on the left, time right-justified
                justifyContent: 'space-between',
                fontVariantNumeric: 'tabular-nums',
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.info.main, 0.25)
                    : '#e3f2fd'
              })}
            />
          )}
        </Grid>
      )}
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
    </Grid>
  )
}

export default BilboMDNerscStep
