import { Job as BullMQJob } from 'bullmq'
import { BilboMdPDBJob, IBilboMDPDBJob } from '@bl1231/bilbomd-mongodb-schema'
import {
  runPdb2Crd,
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs
} from '../functions/bilbomd-step-functions.js'
import { runOmmMinimize, runOmmHeat, runOmmMD } from '../functions/openmm-functions.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles,
  runFoXS
} from '../functions/bilbomd-functions.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'
import { runSingleFoXS } from '../functions/foxs-analysis.js'
import { prepareOpenMMConfigYamlForJob } from '../functions/openmm-functions.js'
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
  await MQjob.updateProgress(5)
  foundJob.progress = 5
  await foundJob.save()

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
  await MQjob.updateProgress(10)
  foundJob.progress = 10
  await foundJob.save()

  if (engine === 'CHARMM') {
    // PDB to CRD/PSF for 'pdb' mode
    await MQjob.log('start pdb2crd')
    await runPdb2Crd(MQjob, foundJob)
    await MQjob.log('end pdb2crd')
  } else {
    // Prepare OpenMM config YAML instead of pdb2crd
    await MQjob.log('start openmm-config')
    await prepareOpenMMConfigYamlForJob(foundJob)
    await MQjob.log('end openmm-config')
  }
  await MQjob.updateProgress(15)
  foundJob.progress = 15
  await foundJob.save()

  // Minimize
  await MQjob.log('start minimize')
  await runners.minimize(MQjob, foundJob)
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

  // Heat
  await MQjob.log('start heat')
  await runners.heat(MQjob, foundJob)
  await MQjob.log('end heat')
  await MQjob.updateProgress(40)
  foundJob.progress = 40
  await foundJob.save()

  // Molecular Dynamics
  await MQjob.log('start md')
  await runners.md(MQjob, foundJob)
  await MQjob.log('end md')
  await MQjob.updateProgress(50)
  foundJob.progress = 50
  await foundJob.save()

  // Extract PDBs from DCDs
  if (engine === 'CHARMM') {
    await MQjob.log('start dcd2pdb')
    await extractPDBFilesFromDCD(MQjob, foundJob)
    await MQjob.log('end dcd2pdb')
    await MQjob.updateProgress(60)
    foundJob.progress = 60
    await foundJob.save()
  }

  // Remediate PDB files
  if (engine === 'CHARMM') {
    await MQjob.log('start remediate')
    await remediatePDBFiles(foundJob)
    await MQjob.log('end remediate')
    await MQjob.updateProgress(70)
    foundJob.progress = 70
    await foundJob.save()
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

export { processBilboMDPDBJob }
