import { Fragment, useState } from 'react'
import {
  Box,
  Button,
  Collapse,
  Divider,
  Tooltip,
  Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { JobStepsDTO, JobType } from '@bilbomd/bilbomd-types'
import BilboMDNerscStep, {
  StepStatusIcon
} from 'features/jobs/BilboMDNerscStep'
import { RUNNING_STEP_BACKGROUND } from 'features/shared/StatusColors'
import { getStepDetails } from 'features/shared/stepDetails'
import {
  formatDuration,
  orderedSteps,
  stepDurationMs,
  type StepEntry
} from './stepModel'

const stepDuration = (step: StepEntry, now: Date): string | undefined => {
  const ms = stepDurationMs(step, now)
  return ms === undefined ? undefined : formatDuration(ms)
}

const iconColor = (status: string) => {
  switch (status) {
    case 'Success':
      return 'success.main'
    case 'Error':
      return 'error.main'
    case 'Running':
      return 'black'
    default:
      return 'action.disabled'
  }
}

const StepTooltip = ({ step, now }: { step: StepEntry; now: Date }) => {
  const { friendlyName, tooltipMessage } = getStepDetails(step.name)
  const duration = stepDuration(step, now)
  return (
    <Box>
      <Typography
        variant="subtitle2"
        component="div"
      >
        {friendlyName} ({step.status})
      </Typography>
      {tooltipMessage && (
        <Typography
          variant="body2"
          component="div"
        >
          {tooltipMessage}
        </Typography>
      )}
      {step.message && (
        <Typography
          variant="body2"
          component="div"
          sx={{ mt: 0.5, fontStyle: 'italic' }}
        >
          {step.message}
        </Typography>
      )}
      {duration && (
        <Typography
          variant="body2"
          component="div"
          sx={{ mt: 0.5 }}
        >
          ⏱ {duration}
        </Typography>
      )}
    </Box>
  )
}

const StepIcon = ({ step, now }: { step: StepEntry; now: Date }) => {
  const running = step.status === 'Running'
  return (
    <Tooltip
      title={
        <StepTooltip
          step={step}
          now={now}
        />
      }
      arrow
    >
      <Box
        data-testid={`step-${step.name}`}
        data-status={step.status}
        tabIndex={0}
        aria-label={`${getStepDetails(step.name).friendlyName}: ${step.status}`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: running ? 1 : 0.25,
          py: 0.25,
          borderRadius: 4,
          backgroundColor: running ? RUNNING_STEP_BACKGROUND : undefined,
          color: 'black'
        }}
      >
        <StepStatusIcon
          status={step.status}
          fontSize="small"
          sx={{ color: iconColor(step.status) }}
        />
        {running && (
          <Typography
            variant="body2"
            component="span"
          >
            {getStepDetails(step.name).friendlyName}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

const StepDetailRows = ({ steps, now }: { steps: StepEntry[]; now: Date }) => (
  <>
    {steps.map((step) => (
      <BilboMDNerscStep
        key={step.name}
        stepName={step.name}
        stepStatus={step.status}
        stepMessage={step.message}
        duration={stepDuration(step, now)}
      />
    ))}
  </>
)

type StepStripProps = {
  steps?: JobStepsDTO
  jobType: JobType
  // Shared clock so running-step durations tick with the job timer
  now: Date
}

const StepStrip = ({ steps, jobType, now }: StepStripProps) => {
  const [showDetails, setShowDetails] = useState(false)
  const { pipeline, nersc } = orderedSteps(steps, jobType)

  if (pipeline.length === 0 && nersc.length === 0) return null

  const groups = [pipeline, nersc].filter((group) => group.length > 0)

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1
        }}
      >
        <Box
          role="list"
          aria-label="job steps"
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 0.5,
            columnGap: 0.25,
            minWidth: 0
          }}
        >
          {groups.map((group, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ mx: 1 }}
                />
              )}
              {group.map((step) => (
                <Box
                  role="listitem"
                  key={step.name}
                  sx={{ display: 'inline-flex' }}
                >
                  <StepIcon
                    step={step}
                    now={now}
                  />
                </Box>
              ))}
              {group === nersc && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', ml: 0.5 }}
                >
                  NERSC
                </Typography>
              )}
            </Fragment>
          ))}
        </Box>
        <Button
          size="small"
          onClick={() => setShowDetails((open) => !open)}
          endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          aria-expanded={showDetails}
          sx={(theme) => ({
            px: 1.25,
            color: 'primary.main',
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.24)
            }
          })}
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </Button>
      </Box>
      <Collapse
        in={showDetails}
        unmountOnExit
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
          <StepDetailRows
            steps={pipeline}
            now={now}
          />
          {nersc.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <StepDetailRows
                steps={nersc}
                now={now}
              />
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

export default StepStrip
