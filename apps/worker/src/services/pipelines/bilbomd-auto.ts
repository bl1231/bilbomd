import { Job as BullMQJob } from 'bullmq'
import { BilboMdAutoJob, IBilboMDAutoJob } from '@bilbomd/mongodb-schema'
import { runAutoRg } from '../functions/autorg.js'
import { runPipeline } from './runPipeline.js'
import {
  charmmRunners,
  classicSimulationAndAnalysis,
  cifToPdbStep,
  openmmPrepSteps,
  openmmRunners,
  paeStep,
  pdb2crdStep
} from './steps.js'

const processBilboMDAutoJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDAutoJob>(MQjob, {
    pipeline: 'auto',
    model: BilboMdAutoJob,
    defaultEngine: 'CHARMM',
    steps: ({ engine }) => [
      cifToPdbStep(),
      // Rigid/flexible domains from the AlphaFold PAE matrix
      paeStep(15),
      // Rg_min / Rg_max for MD from the experimental Guinier fit
      {
        label: 'autorg',
        stepKey: 'autorg',
        run: ({ job }) => runAutoRg(job),
        progress: 20
      },
      ...(engine === 'CHARMM' ? [pdb2crdStep()] : openmmPrepSteps()),
      ...classicSimulationAndAnalysis<IBilboMDAutoJob>(
        engine === 'OpenMM' ? openmmRunners : charmmRunners,
        engine
      )
    ]
  })

export { processBilboMDAutoJob }
