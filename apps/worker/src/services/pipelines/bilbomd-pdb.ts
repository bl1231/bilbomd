import { Job as BullMQJob } from 'bullmq'
import { BilboMdPDBJob, IBilboMDPDBJob } from '@bilbomd/mongodb-schema'
import { runPipeline } from './runPipeline.js'
import {
  charmmRunners,
  classicSimulationAndAnalysis,
  cifToPdbStep,
  openmmPrepSteps,
  openmmRunners,
  pdb2crdStep
} from './steps.js'

const processBilboMDPDBJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDPDBJob>(MQjob, {
    pipeline: 'pdb',
    model: BilboMdPDBJob,
    defaultEngine: 'CHARMM',
    steps: ({ engine }) => [
      cifToPdbStep(),
      // CHARMM needs CRD/PSF; OpenMM needs a cleaned PDB and a config YAML
      ...(engine === 'CHARMM' ? [pdb2crdStep(15)] : openmmPrepSteps(15)),
      ...classicSimulationAndAnalysis<IBilboMDPDBJob>(
        engine === 'OpenMM' ? openmmRunners : charmmRunners,
        engine
      )
    ]
  })

export { processBilboMDPDBJob }
