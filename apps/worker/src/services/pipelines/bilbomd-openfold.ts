import { Job as BullMQJob } from 'bullmq'
import {
  BilboMdOpenFoldJob,
  IBilboMDOpenFoldJob
} from '@bilbomd/mongodb-schema'
import { runOpenFold } from '../functions/openfold-functions.js'
import { runPipeline } from './runPipeline.js'
import { predictedStructureSteps } from './steps.js'

const processBilboMDOpenFoldJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDOpenFoldJob>(MQjob, {
    pipeline: 'openfold',
    model: BilboMdOpenFoldJob,
    defaultEngine: 'OpenMM',
    supportedEngines: ['OpenMM'],
    unsupportedEngineMessage: (engine) =>
      `Local OpenFold3 pipeline only supports md_engine=OpenMM, got ${engine}.`,
    steps: () =>
      predictedStructureSteps({
        label: 'openfold',
        stepKey: 'openfold',
        run: ({ MQjob, job }) => runOpenFold(MQjob, job)
      })
  })

export { processBilboMDOpenFoldJob }
