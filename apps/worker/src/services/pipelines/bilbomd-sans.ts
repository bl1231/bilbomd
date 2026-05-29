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
import { runCifToPdb, runPrepPdb } from '../functions/pdb-to-crd.js'
import {
  extractPDBFilesFromDCD,
  mirrorOmmMdToPepsiSANS,
  remediatePDBFiles,
  runPepsiSANSOnPDBFiles,
  runGASANS,
  prepareBilboMDSANSResults
} from '../functions/bilbomd-sans-functions.js'
// import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc'
import {
  initializeJob,
  cleanupJob,
  runPipelineStep
} from '../functions/job-utils.js'
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
    await runPipelineStep(MQjob, foundJob, 'cif-to-pdb', undefined, async () => {
      foundJob.pdb_file = await runCifToPdb({
        uuid: foundJob.uuid,
        pdb_file: foundJob.pdb_file
      })
    })
  }

  if (engine === 'CHARMM') {
    // PDB to CRD/PSF for 'pdb' mode
    await runPipelineStep(MQjob, foundJob, 'pdb2crd', 'pdb2crd', () =>
      runPdb2Crd(MQjob, foundJob)
    )
    await progress.update(15)

    // CHARMM minimization
    await runPipelineStep(MQjob, foundJob, 'minimize', 'minimize', () =>
      runMinimize(MQjob, foundJob)
    )
    await progress.update(20)

    // CHARMM heating
    await runPipelineStep(MQjob, foundJob, 'heat', 'heat', () =>
      runHeat(MQjob, foundJob)
    )
    await progress.update(30)

    // CHARMM molecular dynamics
    await runPipelineStep(MQjob, foundJob, 'md', 'md', () =>
      runMolecularDynamics(MQjob, foundJob)
    )
    await progress.update(50)

    // Extract PDBs from DCDs
    await runPipelineStep(MQjob, foundJob, 'dcd2pdb', 'dcd2pdb', () =>
      extractPDBFilesFromDCD(MQjob, foundJob)
    )
    await progress.update(60)

    // Remediate PDB files
    await runPipelineStep(MQjob, foundJob, 'remediate', 'pdb_remediate', () =>
      remediatePDBFiles(foundJob)
    )
    await progress.update(70)
  } else {
    // Remove waters and ions — incompatible with the implicit-solvent force field
    await runPipelineStep(MQjob, foundJob, 'prep-pdb', undefined, () =>
      runPrepPdb({ uuid: foundJob.uuid, pdb_file: foundJob.pdb_file })
    )

    // Prepare OpenMM config YAML
    await runPipelineStep(MQjob, foundJob, 'openmm-config', undefined, () =>
      prepareOpenMMConfig(foundJob)
    )

    // OpenMM minimization
    await runPipelineStep(MQjob, foundJob, 'minimize', 'minimize', async () => {
      await runOmmMinimize(MQjob, foundJob)
      // Place minimized PDB at the job root so prepareBilboMDSANSResults can copy it.
      const workDir = path.join(config.uploadDir, foundJob.uuid)
      await fs.copy(
        path.join(workDir, 'openmm', 'minimize', 'minimized.pdb'),
        path.join(workDir, 'minimization_output.pdb'),
        { overwrite: true }
      )
    })
    await progress.update(20)

    // OpenMM heating
    await runPipelineStep(MQjob, foundJob, 'heat', 'heat', () =>
      runOmmHeat(MQjob, foundJob)
    )
    await progress.update(30)

    // OpenMM molecular dynamics
    await runPipelineStep(MQjob, foundJob, 'md', 'md', () =>
      runOmmMD(MQjob, foundJob)
    )
    await progress.update(50)

    // Mirror PDB frames from openmm/md/rg_{N}/ into pepsisans/rg{N}/
    await runPipelineStep(
      MQjob,
      foundJob,
      'mirror-md-to-pepsisans',
      undefined,
      () => mirrorOmmMdToPepsiSANS(foundJob)
    )

    // Generate MP4 movies from DCD files — fire and forget.
    enqueueMakeMovie(MQjob, foundJob)

    await progress.update(70)
  }

  // Calculate Pepsi-SANS profiles
  await runPipelineStep(MQjob, foundJob, 'pepsisans', 'pepsisans', () =>
    runPepsiSANSOnPDBFiles(MQjob, foundJob)
  )
  await progress.update(80)

  // GA-SANS analysis
  await runPipelineStep(MQjob, foundJob, 'ga-sans', 'gasans', () =>
    runGASANS(MQjob, foundJob)
  )
  await progress.update(90)

  // Prepare results
  await runPipelineStep(MQjob, foundJob, 'results', 'results', () =>
    prepareBilboMDSANSResults(foundJob)
  )
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
