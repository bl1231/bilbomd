import { Job as BullMQJob } from 'bullmq'
import { BilboMdOpenFoldJob } from '@bilbomd/mongodb-schema'
import { runOpenFold } from '../functions/openfold-functions.js'
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
import { runPrepPdb } from '../functions/pdb-to-crd.js'
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

const processBilboMDOpenFoldJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdOpenFoldJob.findOne({ _id: MQjob.data.jobid })
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
    pipeline: 'openfold',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  const engine = foundJob.md_engine ?? 'OpenMM'
  if (engine !== 'OpenMM') {
    throw new Error(
      `Local OpenFold3 pipeline only supports md_engine=OpenMM, got ${engine}.`
    )
  }
  await MQjob.log(`Using MD engine: ${engine}`)

  await initializeJob(MQjob, foundJob)
  await progress.update(10)

  await MQjob.log('start openfold')
  await runOpenFold(MQjob, foundJob)
  await MQjob.log('end openfold')
  await progress.update(25)

  await MQjob.log('start prep-pdb')
  await runPrepPdb({
    uuid: foundJob.uuid,
    pdb_file: foundJob.pdb_file as string
  })
  await MQjob.log('end prep-pdb')

  await MQjob.log('start openmm-config')
  await prepareOpenMMConfig(foundJob)
  await MQjob.log('end openmm-config')

  await MQjob.log('start pae')
  await runPaeToConstInp(MQjob, foundJob)
  await MQjob.log('end pae')
  await progress.update(30)

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
    pipeline: 'openfold',
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

export { processBilboMDOpenFoldJob }
