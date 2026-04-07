import { Job as BullMQJob } from 'bullmq'
import { BilboMdAutoJob } from '@bilbomd/mongodb-schema'
import {
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs,
  runPaeToConstInp,
  runAutoRg,
  runPdb2Crd
} from '../functions/bilbomd-step-functions.js'
import {
  runOmmMinimize,
  runOmmHeat,
  runOmmMD,
  prepareOpenMMConfig
} from '../functions/openmm-functions.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles
} from '../functions/bilbomd-functions.js'
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

const processBilboMDAutoJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdAutoJob.findOne({ _id: MQjob.data.jobid })
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
    pipeline: 'auto',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  // Determine MD engine
  const engine = foundJob.md_engine ?? 'CHARMM'
  await MQjob.log(`Using MD engine: ${engine}`)

  // Initialize
  await initializeJob(MQjob, foundJob)
  await progress.update(10)

  // Use PAE to construct const.inp file
  await MQjob.log('start pae')
  await runPaeToConstInp(MQjob, foundJob)
  await MQjob.log('end pae')
  await progress.update(15)

  // Calculate Rg_min and Rg_max
  await MQjob.log('start autorg')
  await runAutoRg(foundJob)
  await MQjob.log('end autorg')
  await progress.update(20)

  if (engine === 'CHARMM') {
    // Make sure CRD/PSF files are ready
    await MQjob.log('start pdb2crd')
    await runPdb2Crd(MQjob, foundJob)
    await MQjob.log('end pdb2crd')

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
  } else {
    // Prepare OpenMM config YAML
    await MQjob.log('start openmm-config')
    await prepareOpenMMConfig(foundJob)
    await MQjob.log('end openmm-config')

    // OpenMM minimization
    await MQjob.log('start minimize')
    await runOmmMinimize(MQjob, foundJob)
    await MQjob.log('end minimize')
    await progress.update(25)

    // FoXS calculations on minimization_output.pdb
    await MQjob.log('start initfoxs')
    await runSingleFoXS(foundJob)
    await MQjob.log('end initfoxs')
    await progress.update(30)

    // OpenMM heating
    await MQjob.log('start heat')
    await runOmmHeat(MQjob, foundJob)
    await MQjob.log('end heat')
    await progress.update(40)

    // OpenMM molecular dynamics
    await MQjob.log('start md')
    await runOmmMD(MQjob, foundJob)
    await MQjob.log('end md')
    await progress.update(50)

    // Generate MP4 movies from DCD files
    // We don't want to await this.
    // Just fire and forget.
    enqueueMakeMovie(MQjob, foundJob)
  }

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
    pipeline: 'auto',
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

export { processBilboMDAutoJob }
