import { Job as BullMQJob } from 'bullmq'
import { BilboMdCRDJob, IBilboMDCRDJob } from '@bilbomd/mongodb-schema'
import { runPipeline } from './runPipeline.js'
import { charmmRunners, classicSimulationAndAnalysis } from './steps.js'

// CRD/PSF uploads are already CHARMM inputs, so there is no preparation step
// and no OpenMM option.
const processBilboMDCRDJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDCRDJob>(MQjob, {
    pipeline: 'crd',
    model: BilboMdCRDJob,
    defaultEngine: 'CHARMM',
    fixedEngine: 'CHARMM',
    steps: () =>
      classicSimulationAndAnalysis<IBilboMDCRDJob>(charmmRunners, 'CHARMM')
  })

export { processBilboMDCRDJob }
