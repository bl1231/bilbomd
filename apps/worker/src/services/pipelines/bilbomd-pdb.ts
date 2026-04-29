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
import { runCifToPdb, runStripIons } from '../functions/pdb-to-crd.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles
} from '../functions/bilbomd-functions.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'
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
  } else {
    // Strip ions before OpenMM — ForceField has no parameters for metal ions
    await MQjob.log('start strip-ions')
    await runStripIons({ uuid: foundJob.uuid, pdb_file: foundJob.pdb_file })
    await MQjob.log('end strip-ions')

    // Strip unsupported cofactors (FAD, HEM, PCA, etc.) — no bundled Amber parameters.
    // They are removed for MD only; the original uploaded PDB is used for FoXS.
    // await MQjob.log('start strip-cofactors')
    // await runStripCofactors({ uuid: foundJob.uuid, pdb_file: foundJob.pdb_file })
    // await MQjob.log('end strip-cofactors')

    // Prepare OpenMM config YAML instead of pdb2crd
    await MQjob.log('start openmm-config')
    await prepareOpenMMConfig(foundJob)
    await MQjob.log('end openmm-config')
  }
  await progress.update(15)

  // Minimize
  await MQjob.log('start minimize')
  await runners.minimize(MQjob, foundJob)
  await MQjob.log('end minimize')
  await progress.update(25)

  // FoXS calculations on minimization_output.pdb
  await MQjob.log('start initfoxs')
  await runSingleFoXS(foundJob)
  await MQjob.log('end initfoxs')
  await progress.update(30)

  // Heat
  await MQjob.log('start heat')
  await runners.heat(MQjob, foundJob)
  await MQjob.log('end heat')
  await progress.update(40)

  // Molecular Dynamics
  await MQjob.log('start md')
  await runners.md(MQjob, foundJob)
  await MQjob.log('end md')
  await progress.update(50)

  // Generate MP4 movies from DCD files (OpenMM only, fire-and-forget)
  if (engine === 'OpenMM') {
    enqueueMakeMovie(MQjob, foundJob)
  }

  // Extract PDBs from DCDs
  if (engine === 'CHARMM') {
    await MQjob.log('start dcd2pdb')
    await extractPDBFilesFromDCD(MQjob, foundJob)
    await MQjob.log('end dcd2pdb')
    await progress.update(60)
  }

  // Remediate PDB files
  if (engine === 'CHARMM') {
    await MQjob.log('start remediate')
    await remediatePDBFiles(foundJob)
    await MQjob.log('end remediate')
    await progress.update(70)
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
