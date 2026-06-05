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
import { runCifToPdb, runPrepPdb } from '../functions/pdb-to-crd.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles
} from '../functions/bilbomd-functions.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import {
  initializeJob,
  cleanupJob,
  runPipelineStep
} from '../functions/job-utils.js'
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

  // Convert CIF → PDB before any engine-specific processing
  if (foundJob.pdb_file?.toLowerCase().endsWith('.cif')) {
    await runPipelineStep(MQjob, foundJob, 'cif-to-pdb', undefined, async () => {
      foundJob.pdb_file = await runCifToPdb({
        uuid: foundJob.uuid,
        pdb_file: foundJob.pdb_file
      })
    })
  }

  // Use PAE to construct const.inp file
  await runPipelineStep(MQjob, foundJob, 'pae', 'pae', () =>
    runPaeToConstInp(MQjob, foundJob)
  )
  await progress.update(15)

  // Calculate Rg_min and Rg_max
  await runPipelineStep(MQjob, foundJob, 'autorg', 'autorg', () =>
    runAutoRg(foundJob)
  )
  await progress.update(20)

  if (engine === 'CHARMM') {
    // Make sure CRD/PSF files are ready
    await runPipelineStep(MQjob, foundJob, 'pdb2crd', 'pdb2crd', () =>
      runPdb2Crd(MQjob, foundJob)
    )

    // CHARMM minimization
    await runPipelineStep(MQjob, foundJob, 'minimize', 'minimize', () =>
      runMinimize(MQjob, foundJob)
    )
    await progress.update(25)

    // FoXS calculations on minimization_output.pdb
    await runPipelineStep(MQjob, foundJob, 'initfoxs', 'initfoxs', () =>
      runSingleFoXS(foundJob)
    )
    await progress.update(30)

    // CHARMM heating
    await runPipelineStep(MQjob, foundJob, 'heat', 'heat', () =>
      runHeat(MQjob, foundJob)
    )
    await progress.update(40)

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
    await runPipelineStep(MQjob, foundJob, 'minimize', 'minimize', () =>
      runOmmMinimize(MQjob, foundJob)
    )
    await progress.update(25)

    // FoXS calculations on minimization_output.pdb
    await runPipelineStep(MQjob, foundJob, 'initfoxs', 'initfoxs', () =>
      runSingleFoXS(foundJob)
    )
    await progress.update(30)

    // OpenMM heating
    await runPipelineStep(MQjob, foundJob, 'heat', 'heat', () =>
      runOmmHeat(MQjob, foundJob)
    )
    await progress.update(40)

    // OpenMM molecular dynamics
    await runPipelineStep(MQjob, foundJob, 'md', 'md', () =>
      runOmmMD(MQjob, foundJob)
    )
    await progress.update(50)

    // Generate MP4 movies from DCD files
    // We don't want to await this.
    // Just fire and forget.
    enqueueMakeMovie(MQjob, foundJob)
  }

  // Calculate FoXS profiles
  await runPipelineStep(MQjob, foundJob, 'foxs', 'foxs', () =>
    runFoXS(MQjob, foundJob)
  )
  await progress.update(80)

  // MultiFoXS
  await runPipelineStep(MQjob, foundJob, 'multifoxs', 'multifoxs', () =>
    runMultiFoxs(MQjob, foundJob)
  )
  await progress.update(95)

  // Prepare results
  await runPipelineStep(MQjob, foundJob, 'results', 'results', () =>
    prepareBilboMDResults(foundJob)
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
