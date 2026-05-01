import { Job as BullMQJob } from 'bullmq'
import { BilboMdSANSJob } from '@bilbomd/mongodb-schema'
import path from 'node:path'
import fs from 'fs-extra'
import { config } from '../../config/config.js'
import {
  runPdb2Crd,
  runMinimize,
  runHeat,
  runMolecularDynamics
} from '../functions/bilbomd-step-functions.js'
import {
  runOmmMinimize,
  runOmmHeat,
  runOmmMD,
  prepareOpenMMConfig
} from '../functions/openmm-functions.js'
import { runCifToPdb } from '../functions/pdb-to-crd.js'
import {
  extractPDBFilesFromDCD,
  mirrorOmmMdToPepsiSANS,
  remediatePDBFiles,
  runPepsiSANSOnPDBFiles,
  runGASANS,
  prepareBilboMDSANSResults
} from '../functions/bilbomd-sans-functions.js'
// import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'
import { enqueueMakeMovie } from '../functions/movie-enqueuer.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usage-events.js'
import { createProgressTracker } from '../functions/progress-tracker.js'

const processBilboMDSANSJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdSANSJob.findOne({ _id: MQjob.data.jobid })
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
    pipeline: 'sans',
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

  // Convert CIF → PDB before any engine-specific processing
  if (foundJob.pdb_file?.toLowerCase().endsWith('.cif')) {
    await MQjob.log('start cif-to-pdb')
    foundJob.pdb_file = await runCifToPdb({
      uuid: foundJob.uuid,
      pdb_file: foundJob.pdb_file
    })
    await MQjob.log(`end cif-to-pdb: ${foundJob.pdb_file}`)
  }

  if (engine === 'CHARMM') {
    // PDB to CRD/PSF for 'pdb' mode
    await MQjob.log('start pdb2crd')
    await runPdb2Crd(MQjob, foundJob)
    await MQjob.log('end pdb2crd')
    await progress.update(15)

    // CHARMM minimization
    await MQjob.log('start minimize')
    await runMinimize(MQjob, foundJob)
    await MQjob.log('end minimize')
    await progress.update(20)

    // CHARMM heating
    await MQjob.log('start heat')
    await runHeat(MQjob, foundJob)
    await MQjob.log('end heat')
    await progress.update(30)

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
    // Place minimized PDB at the job root so prepareBilboMDSANSResults can copy it.
    const workDir = path.join(config.uploadDir, foundJob.uuid)
    await fs.copy(
      path.join(workDir, 'openmm', 'minimize', 'minimized.pdb'),
      path.join(workDir, 'minimization_output.pdb'),
      { overwrite: true }
    )
    await progress.update(20)

    // OpenMM heating
    await MQjob.log('start heat')
    await runOmmHeat(MQjob, foundJob)
    await MQjob.log('end heat')
    await progress.update(30)

    // OpenMM molecular dynamics
    await MQjob.log('start md')
    await runOmmMD(MQjob, foundJob)
    await MQjob.log('end md')
    await progress.update(50)

    // Mirror PDB frames from openmm/md/rg_{N}/ into pepsisans/rg{N}/
    await MQjob.log('start mirror-md-to-pepsisans')
    await mirrorOmmMdToPepsiSANS(foundJob)
    await MQjob.log('end mirror-md-to-pepsisans')

    // Generate MP4 movies from DCD files — fire and forget.
    enqueueMakeMovie(MQjob, foundJob)

    await progress.update(70)
  }

  // Calculate Pepsi-SANS profiles
  await MQjob.log('start pepsisans')
  await runPepsiSANSOnPDBFiles(MQjob, foundJob)
  await MQjob.log('end pepsisans')
  await progress.update(80)

  // GA-SANS analysis
  await MQjob.log('start ga-sans')
  await runGASANS(MQjob, foundJob)
  await MQjob.log('end ga-sans')
  await progress.update(90)

  // Prepare results
  await MQjob.log('start results')
  await prepareBilboMDSANSResults(foundJob)
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
    pipeline: 'sans',
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

export { processBilboMDSANSJob }
