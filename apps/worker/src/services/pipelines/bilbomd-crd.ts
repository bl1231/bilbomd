import { Job as BullMQJob } from 'bullmq'
import { BilboMdCRDJob } from '@bilbomd/mongodb-schema'
import {
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs
} from '../functions/bilbomd-step-functions.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles
} from '../functions/bilbomd-functions.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'
import { runSingleFoXS } from '../functions/foxs-analysis.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usage-events.js'
import { createProgressTracker } from '../functions/progress-tracker.js'

const processBilboMDCRDJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdCRDJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }

  const progress = createProgressTracker(MQjob, foundJob)
  await progress.update(5)

  // Record job start
  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'crd',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  // Initialize
  await initializeJob(MQjob, foundJob)
  await progress.update(10)

  // CHARMM minimization
  await MQjob.log('start minimize')
  await runMinimize(MQjob, foundJob)
  await MQjob.log('end minimize')
  await progress.update(25)

  // FoXS calculations on minimization_output.pdb
  await MQjob.log('start initfoxs')
  await runSingleFoXS(foundJob)
  await MQjob.log('end initfoxs')
  await progress.update(30)

  // CHARMM heating
  await MQjob.log('start heat')
  await runHeat(MQjob, foundJob)
  await MQjob.log('end heat')
  await progress.update(40)

  // CHARMM molecular dynamics
  await MQjob.log('start md')
  await runMolecularDynamics(MQjob, foundJob)
  await MQjob.log('end md')
  await progress.update(50)

  // Extract PDBs from DCDs
  await MQjob.log('start dcd2pdb')
  await extractPDBFilesFromDCD(MQjob, foundJob)
  await MQjob.log('end dcd2pdb')
  await progress.update(60)

  // Remediate PDB files
  await MQjob.log('start remediate')
  await remediatePDBFiles(foundJob)
  await MQjob.log('end remediate')
  await progress.update(70)

  // Calculate FoXS profiles
  await MQjob.log('start foxs')
  await runFoXS(MQjob, foundJob)
  await MQjob.log('end foxs')
  await progress.update(80)

  // MultiFoXS
  await MQjob.log('start multifoxs')
  await runMultiFoxs(MQjob, foundJob)
  await MQjob.log('end multifoxs')
  await progress.update(95)

  // Prepare results
  await MQjob.log('start results')
  await prepareBilboMDResults(foundJob)
  await MQjob.log('end results')
  await progress.update(99)

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await progress.update(100)

  // Record job completion with duration if available
  const durationMs =
    foundJob.time_started && foundJob.time_completed
      ? new Date(foundJob.time_completed).getTime() -
        new Date(foundJob.time_started).getTime()
      : undefined
  await recordWorkerUsageEvent({
    uuid: foundJob.uuid,
    jobId: foundJob._id,
    pipeline: 'crd',
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

export { processBilboMDCRDJob }
