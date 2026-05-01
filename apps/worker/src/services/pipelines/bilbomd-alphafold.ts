import { Job as BullMQJob } from 'bullmq'
import { BilboMdAlphaFoldJob } from '@bilbomd/mongodb-schema'
import { runAlphaFold } from '../functions/alphafold-functions.js'
import {
  runPaeToConstInp,
  runMultiFoxs
} from '../functions/bilbomd-step-functions.js'
import {
  prepareOpenMMConfig,
  runOmmMinimize,
  runOmmHeat,
  runOmmMD
} from '../functions/openmm-functions.js'
import { runStripIons } from '../functions/pdb-to-crd.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'
import { runSingleFoXS } from '../functions/foxs-analysis.js'
import { enqueueMakeMovie } from '../functions/movie-enqueuer.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usage-events.js'
import { createProgressTracker } from '../functions/progress-tracker.js'

const processBilboMDAlphaFoldJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdAlphaFoldJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }

  const progress = createProgressTracker(MQjob, foundJob)
  await progress.update(5)

  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'alphafold',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  // v1: epyc only supports OpenMM for AF jobs. CHARMM AF remains on NERSC.
  const engine = foundJob.md_engine ?? 'OpenMM'
  if (engine !== 'OpenMM') {
    throw new Error(
      `Local AlphaFold pipeline only supports md_engine=OpenMM, got ${engine}. ` +
        'CHARMM AlphaFold jobs must be submitted to NERSC.'
    )
  }
  await MQjob.log(`Using MD engine: ${engine}`)

  await initializeJob(MQjob, foundJob)
  await progress.update(10)

  // ColabFold → af-rank1.pdb + af-pae.json. Sets pdb_file/pae_file on the job.
  await MQjob.log('start alphafold')
  await runAlphaFold(MQjob, foundJob)
  await MQjob.log('end alphafold')
  await progress.update(25)

  // Strip metal ions before OpenMM ForceField sees the structure.
  await MQjob.log('start strip-ions')
  await runStripIons({
    uuid: foundJob.uuid,
    pdb_file: foundJob.pdb_file as string
  })
  await MQjob.log('end strip-ions')

  // First openmm_config.yaml — bare config, no constraints yet.
  await MQjob.log('start openmm-config')
  await prepareOpenMMConfig(foundJob)
  await MQjob.log('end openmm-config')

  // PAE → openmm_const.yml.
  await MQjob.log('start pae')
  await runPaeToConstInp(MQjob, foundJob)
  await MQjob.log('end pae')
  await progress.update(30)

  // Re-run prepareOpenMMConfig so openmm_const.yml is folded into openmm_config.yaml.
  await MQjob.log('start openmm-config-merge')
  await prepareOpenMMConfig(foundJob)
  await MQjob.log('end openmm-config-merge')

  await MQjob.log('start minimize')
  await runOmmMinimize(MQjob, foundJob)
  await MQjob.log('end minimize')
  await progress.update(40)

  await MQjob.log('start initfoxs')
  await runSingleFoXS(foundJob)
  await MQjob.log('end initfoxs')
  await progress.update(45)

  await MQjob.log('start heat')
  await runOmmHeat(MQjob, foundJob)
  await MQjob.log('end heat')
  await progress.update(55)

  await MQjob.log('start md')
  await runOmmMD(MQjob, foundJob)
  await MQjob.log('end md')
  await progress.update(70)

  // Movie generation (fire-and-forget).
  enqueueMakeMovie(MQjob, foundJob)

  await MQjob.log('start foxs')
  await runFoXS(MQjob, foundJob)
  await MQjob.log('end foxs')
  await progress.update(85)

  await MQjob.log('start multifoxs')
  await runMultiFoxs(MQjob, foundJob)
  await MQjob.log('end multifoxs')
  await progress.update(95)

  await MQjob.log('start results')
  await prepareBilboMDResults(foundJob)
  await MQjob.log('end results')
  await progress.update(99)

  await cleanupJob(MQjob, foundJob)
  await progress.update(100)

  const durationMs =
    foundJob.time_started && foundJob.time_completed
      ? new Date(foundJob.time_completed).getTime() -
        new Date(foundJob.time_started).getTime()
      : undefined
  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'alphafold',
    eventType: 'job_completed',
    status: 'Completed',
    durationMs,
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })
}

export { processBilboMDAlphaFoldJob }
