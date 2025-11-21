import { Alert, Chip } from '@mui/material'
import Grid from '@mui/material/Grid'
import BilboMDScoperStep from './BilboMDScoperStep'
import Item from 'themes/components/Item'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'

interface BilboMDStepsProps {
  job: BilboMDJobDTO
}

const BilboMDScoperSteps = ({ job }: BilboMDStepsProps) => {
  const stepsToShow = [
    'reduce',
    'rnaview',
    'kgs',
    'foxs',
    'IonNet',
    'multifoxs'
  ]

  if (job.mongo.jobType && job.mongo.jobType === 'scoper') {
    return (
      <Item>
        <Grid container>
          {Object.entries(job.mongo.jobType)
            .filter(([stepName]) => stepsToShow.includes(stepName))
            .map(([stepName, stepValue]) => (
              <BilboMDScoperStep
                key={stepName}
                stepName={stepName}
                stepStatus={String(stepValue)}
              />
            ))}
        </Grid>
      </Item>
    )
  }

  return <Item>No steps available</Item>
}

const BilboMDScoperStepsV2 = ({ job }: BilboMDStepsProps) => {
  if (job.mongo.jobType && job.mongo.jobType === 'scoper') {
    return (
      <Item>
        <Alert severity="warning">Scoper status is a work in progress</Alert>

        <Grid
          container
          spacing={1}
        >
          <Grid sx={{ m: 0.5, display: 'flex', alignItems: 'center' }}>
            <Chip
              size="small"
              label="reduce"
            />
            <Chip
              size="small"
              label="RNAview"
            />
            <Chip
              size="small"
              label="KGS"
            />
          </Grid>
        </Grid>
      </Item>
    )
  }

  return <Item>No steps available</Item>
}

export { BilboMDScoperSteps, BilboMDScoperStepsV2 }
