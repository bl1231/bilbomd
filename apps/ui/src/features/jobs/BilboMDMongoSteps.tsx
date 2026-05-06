import BilboMDNerscStep from './BilboMDNerscStep'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip
} from '@mui/material'
import Grid from '@mui/material/Grid'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HeaderBox from 'components/HeaderBox'
import { IBilboMDSteps } from '@bilbomd/mongodb-schema'

interface BilboMDMongoStepsProps {
  steps: IBilboMDSteps
}

const BilboMDMongoSteps: React.FC<BilboMDMongoStepsProps> = ({ steps }) => {
  const accordionTitle = 'kgs' in steps ? 'Scoper Steps' : 'BilboMD Steps'
  let stepsToHide: string[] = []
  stepsToHide = ['_id']

  const stepOrder = [
    'autorg',
    'alphafold',
    'openfold',
    'reduce',
    'rnaview',
    'kgs',
    'ionnet',
    'pdb2crd',
    'pae',
    'minimize',
    'initfoxs',
    'heat',
    'md',
    'dcd2pdb',
    'pdb_remediate',
    'foxs',
    'pepsisans',
    'multifoxs',
    'gasans',
    'copy_results_to_cfs',
    'results',
    'email',
    'nersc_prepare_slurm_batch',
    'nersc_submit_slurm_batch',
    'nersc_job_status',
    'nersc_copy_results_to_cfs'
  ]

  // Convert steps into an array of step entries
  const bilboMdSteps = Object.entries(steps)
    .filter(([stepName]) => !stepsToHide.includes(stepName))
    .sort(
      ([a], [b]) =>
        stepOrder.indexOf(a) - stepOrder.indexOf(b) || a.localeCompare(b)
    )
    .map(([stepName, stepValue]) => (
      <BilboMDNerscStep
        key={stepName}
        stepName={stepName}
        stepStatus={stepValue.status}
        stepMessage={stepValue.message}
      />
    ))

  // Show the message of whichever step is currently Running
  const latestStepMessage =
    Object.values(steps).find((step) => step?.status === 'Running')?.message ??
    ''

  return (
    <Accordion
      defaultExpanded={steps.results?.status === 'Success' ? false : true}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
        sx={{
          backgroundColor: '#888',
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          pl: 1
        }}
      >
        <HeaderBox sx={{ py: 0 }}>
          <Typography>{accordionTitle}</Typography>
        </HeaderBox>
      </AccordionSummary>
      <AccordionDetails>
        <Grid
          container
          sx={{ flexDirection: 'column' }}
        >
          {bilboMdSteps}

          {latestStepMessage && (
            <Chip
              label={latestStepMessage}
              variant="filled"
              sx={{
                mt: 2,
                fontSize: '1.5em',
                backgroundColor: 'green',
                color: 'white',
                width: 'auto'
              }}
            />
          )}
        </Grid>
      </AccordionDetails>
    </Accordion>
  )
}

export default BilboMDMongoSteps
