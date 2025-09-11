import { Job as BullMQJob } from 'bullmq'
import { BilboMdSANSJob } from '@bl1231/bilbomd-mongodb-schema'
import {
  runPdb2Crd,
  runMinimize,
  runHeat,
  runMolecularDynamics
} from '../functions/bilbomd-step-functions.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles,
  runPepsiSANSOnPDBFiles,
  runGASANS,
  prepareBilboMDSANSResults
} from '../functions/bilbomd-sans-functions.js'
// import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc'
import { initializeJob, cleanupJob } from '../functions/job-utils.js'

const processBilboMDSANSJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdSANSJob.findOne({ _id: MQjob.data.jobid })
    .populate('user')
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)
  foundJob.progress = 5
  await foundJob.save()

  // Initialize
  await initializeJob(MQjob, foundJob)
  await MQjob.updateProgress(10)
  foundJob.progress = 10
  await foundJob.save()

  // PDB to CRD/PSF for 'pdb' mode
  await MQjob.log('start pdb2crd')
  await runPdb2Crd(MQjob, foundJob)
  await MQjob.log('end pdb2crd')
  await MQjob.updateProgress(15)
  foundJob.progress = 15
  await foundJob.save()

  // CHARMM minimization
  await MQjob.log('start minimize')
  await runMinimize(MQjob, foundJob)
  await MQjob.log('end minimize')
  await MQjob.updateProgress(20)
  foundJob.progress = 20
  await foundJob.save()

  // CHARMM heating
  await MQjob.log('start heat')
  await runHeat(MQjob, foundJob)
  await MQjob.log('end heat')
  await MQjob.updateProgress(30)
  foundJob.progress = 30
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

  // Calculate Pepsi-SANS profiles
  await MQjob.log('start pepsisans')
  await runPepsiSANSOnPDBFiles(MQjob, foundJob)
  await MQjob.log('end pepsisans')
  await MQjob.updateProgress(80)
  foundJob.progress = 80
  await foundJob.save()

  // GA-SANS analysis
  await MQjob.log('start ga-sans')
  await runGASANS(MQjob, foundJob)
  await MQjob.log('end ga-sans')
  await MQjob.updateProgress(90)
  foundJob.progress = 90
  await foundJob.save()

  // Prepare results
  await MQjob.log('start results')
  await prepareBilboMDSANSResults(foundJob)
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

export { processBilboMDSANSJob }
