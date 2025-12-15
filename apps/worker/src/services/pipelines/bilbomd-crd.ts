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
} from '../functions/usageEvents.js'

const processBilboMDCRDJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdCRDJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)
  foundJob.progress = 5
  await foundJob.save()

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
  await MQjob.updateProgress(10)
  foundJob.progress = 10
  await foundJob.save()

  // CHARMM minimization
  await MQjob.log('start minimize')
  await runMinimize(MQjob, foundJob)
  await MQjob.log('end minimize')
  await MQjob.updateProgress(25)
  foundJob.progress = 25
  await foundJob.save()

  // FoXS calculations on minimization_output.pdb
  await MQjob.log('start initfoxs')
  await runSingleFoXS(foundJob)
  await MQjob.log('end initfoxs')
  await MQjob.updateProgress(30)
  foundJob.progress = 30
  await foundJob.save()

  // CHARMM heating
  await MQjob.log('start heat')
  await runHeat(MQjob, foundJob)
  await MQjob.log('end heat')
  await MQjob.updateProgress(40)
  foundJob.progress = 40
  await foundJob.save()

  // CHARMM molecular dynamics
  await MQjob.log('start md')
  await runMolecularDynamics(MQjob, foundJob)
  await MQjob.log('end md')
  await MQjob.updateProgress(50)
  foundJob.progress = 50
  await foundJob.save()

  // Extract PDBs from DCDs
  await MQjob.log('start dcd2pdb')
  await extractPDBFilesFromDCD(MQjob, foundJob)
  await MQjob.log('end dcd2pdb')
  await MQjob.updateProgress(60)
  foundJob.progress = 60
  await foundJob.save()

  // Remediate PDB files
  await MQjob.log('start remediate')
  await remediatePDBFiles(foundJob)
  await MQjob.log('end remediate')
  await MQjob.updateProgress(70)
  foundJob.progress = 70
  await foundJob.save()

  // Calculate FoXS profiles
  await MQjob.log('start foxs')
  await runFoXS(MQjob, foundJob)
  await MQjob.log('end foxs')
  await MQjob.updateProgress(80)
  foundJob.progress = 80
  await foundJob.save()

  // MultiFoXS
  await MQjob.log('start multifoxs')
  await runMultiFoxs(MQjob, foundJob)
  await MQjob.log('end multifoxs')
  await MQjob.updateProgress(95)
  foundJob.progress = 95
  await foundJob.save()

  // Prepare results
  await MQjob.log('start results')
  await prepareBilboMDResults(foundJob)
  await MQjob.log('end results')
  await MQjob.updateProgress(99)
  foundJob.progress = 99
  await foundJob.save()

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
  foundJob.progress = 100
  await foundJob.save()

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
