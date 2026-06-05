import { Job as BullMQJob } from 'bullmq'
import { BilboMdPDBJob, IBilboMDPDBJob } from '@bilbomd/mongodb-schema'
import {
  runPdb2Crd,
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs
} from '../functions/bilbomd-step-functions.js'
import {
  runOmmMinimize,
  runOmmHeat,
  runOmmMD
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
import { prepareOpenMMConfig } from '../functions/openmm-functions.js'
import { enqueueMakeMovie } from '../functions/movie-enqueuer.js'
import {
  recordWorkerUsageEvent,
  buildContext
} from '../functions/usage-events.js'
import { createProgressTracker } from '../functions/progress-tracker.js'

type StepRunners = {
  minimize: (MQjob: BullMQJob, job: IBilboMDPDBJob) => Promise<void>
  heat: (MQjob: BullMQJob, job: IBilboMDPDBJob) => Promise<void>
  md: (MQjob: BullMQJob, job: IBilboMDPDBJob) => Promise<void>
}

const processBilboMDPDBJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdPDBJob.findOne({ _id: MQjob.data.jobid })
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
    pipeline: 'pdb',
    eventType: 'job_started',
    status: 'Running',
    context: buildContext({
      access_mode: foundJob.access_mode,
      user: foundJob.user,
      public_id: foundJob.public_id,
      client_ip_hash: foundJob.client_ip_hash
    })
  })

  const engine = foundJob.md_engine ?? 'CHARMM'
  const runners: StepRunners =
    engine === 'OpenMM'
      ? {
          minimize: runOmmMinimize,
          heat: runOmmHeat,
          md: runOmmMD
        }
      : {
          minimize: runMinimize,
          heat: runHeat,
          md: runMolecularDynamics
        }

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
  } else {
    // Remove waters and ions — incompatible with the implicit-solvent force field
    await runPipelineStep(MQjob, foundJob, 'prep-pdb', undefined, () =>
      runPrepPdb({ uuid: foundJob.uuid, pdb_file: foundJob.pdb_file })
    )

    // Strip unsupported cofactors (FAD, HEM, PCA, etc.) — no bundled Amber parameters.
    // They are removed for MD only; the original uploaded PDB is used for FoXS.

    // Prepare OpenMM config YAML instead of pdb2crd
    await runPipelineStep(MQjob, foundJob, 'openmm-config', undefined, () =>
      prepareOpenMMConfig(foundJob)
    )
  }
  await progress.update(15)

  // Minimize
  await runPipelineStep(MQjob, foundJob, 'minimize', 'minimize', () =>
    runners.minimize(MQjob, foundJob)
  )
  await progress.update(25)

  // FoXS calculations on minimization_output.pdb
  await runPipelineStep(MQjob, foundJob, 'initfoxs', 'initfoxs', () =>
    runSingleFoXS(foundJob)
  )
  await progress.update(30)

  // Heat
  await runPipelineStep(MQjob, foundJob, 'heat', 'heat', () =>
    runners.heat(MQjob, foundJob)
  )
  await progress.update(40)

  // Molecular Dynamics
  await runPipelineStep(MQjob, foundJob, 'md', 'md', () =>
    runners.md(MQjob, foundJob)
  )
  await progress.update(50)

  // Generate MP4 movies from DCD files (OpenMM only, fire-and-forget)
  if (engine === 'OpenMM') {
    enqueueMakeMovie(MQjob, foundJob)
  }

  // Extract PDBs from DCDs
  if (engine === 'CHARMM') {
    await runPipelineStep(MQjob, foundJob, 'dcd2pdb', 'dcd2pdb', () =>
      extractPDBFilesFromDCD(MQjob, foundJob)
    )
    await progress.update(60)
  }

  // Remediate PDB files
  if (engine === 'CHARMM') {
    await runPipelineStep(MQjob, foundJob, 'remediate', 'pdb_remediate', () =>
      remediatePDBFiles(foundJob)
    )
    await progress.update(70)
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
    pipeline: 'pdb',
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

export { processBilboMDPDBJob }
