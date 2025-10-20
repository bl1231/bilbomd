import { Job as BullMQJob } from 'bullmq'
import { BilboMdAutoJob } from '@bilbomd/mongodb-schema'
import {
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs,
  runPaeToConstInp,
  runAutoRg
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

const processBilboMDAutoJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdAutoJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)
  foundJob.progress = 5
  await foundJob.save()

  // Determine MD engine
  const engine = foundJob.md_engine ?? 'CHARMM'
  await MQjob.log(`Using MD engine: ${engine}`)

  // Initialize
  await initializeJob(MQjob, foundJob)
  await MQjob.updateProgress(10)
  foundJob.progress = 10
  await foundJob.save()

  // Use PAE to construct const.inp file
  await MQjob.log('start pae')
  await runPaeToConstInp(MQjob, foundJob)
  await MQjob.log('end pae')
  await MQjob.updateProgress(15)
  foundJob.progress = 15
  await foundJob.save()

  // Calculate Rg_min and Rg_max
  await MQjob.log('start autorg')
  await runAutoRg(foundJob)
  await MQjob.log('end autorg')
  await MQjob.updateProgress(20)
  foundJob.progress = 20
  await foundJob.save()

  if (engine === 'CHARMM') {
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
  } else {
    // Prepare OpenMM config YAML
    await MQjob.log('start openmm-config')
    await prepareOpenMMConfig(foundJob)
    await MQjob.log('end openmm-config')

    // OpenMM minimization
    await MQjob.log('start minimize')
    await runOmmMinimize(MQjob, foundJob)
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

    // OpenMM heating
    await MQjob.log('start heat')
    await runOmmHeat(MQjob, foundJob)
    await MQjob.log('end heat')
    await MQjob.updateProgress(40)
    foundJob.progress = 40
    await foundJob.save()

    // OpenMM molecular dynamics
    await MQjob.log('start md')
    await runOmmMD(MQjob, foundJob)
    await MQjob.log('end md')
    await MQjob.updateProgress(50)
    foundJob.progress = 50
    await foundJob.save()

    // Generate MP4 movies from DCD files (OpenMM only)
    // I don't want to await this. I want to enqueue it to the "movie" queue once MD is done.
    // await MQjob.log('start movies')
    // await runGenerateMovies(MQjob, foundJob)
    // await MQjob.log('end movies')
    // await MQjob.updateProgress(55)
    // foundJob.progress = 55
    // await foundJob.save()
    enqueueMakeMovie(MQjob, foundJob)
  }

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
  await prepareBilboMDResults(MQjob, foundJob)
  await MQjob.log('end results')
  await MQjob.updateProgress(99)
  foundJob.progress = 99
  await foundJob.save()

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
  foundJob.progress = 100
  await foundJob.save()
}

export { processBilboMDAutoJob }
