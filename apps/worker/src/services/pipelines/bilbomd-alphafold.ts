import { Job as BullMQJob } from 'bullmq'
import {
  BilboMdAlphaFoldJob,
  IBilboMDAlphaFoldJob
} from '@bilbomd/mongodb-schema'
import { runAlphaFold } from '../functions/alphafold-functions.js'
import { runPipeline } from './runPipeline.js'
import { predictedStructureSteps } from './steps.js'

const processBilboMDAlphaFoldJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDAlphaFoldJob>(MQjob, {
    pipeline: 'alphafold',
    model: BilboMdAlphaFoldJob,
    defaultEngine: 'OpenMM',
    // v1: epyc only supports OpenMM for AF jobs. CHARMM AF remains on NERSC.
    supportedEngines: ['OpenMM'],
    unsupportedEngineMessage: (engine) =>
      `Local AlphaFold pipeline only supports md_engine=OpenMM, got ${engine}. ` +
      'CHARMM AlphaFold jobs must be submitted to NERSC.',
    steps: () =>
      predictedStructureSteps({
        // ColabFold → af-rank1.pdb + af-pae.json; sets pdb_file/pae_file
        label: 'alphafold',
        stepKey: 'alphafold',
        run: ({ MQjob, job }) => runAlphaFold(MQjob, job)
      })
  })

export { processBilboMDAlphaFoldJob }
