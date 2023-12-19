import { Job as BullMQJob } from 'bullmq'
import { BilboMdScoperJob, IBilboMDScoperJob } from './model/Job.js'
import { User } from './model/User.js'
import { sendJobCompleteEmail } from './mailer.js'
import { runScoper, prepareScoperResults } from './scoper.functions.js'

const bilbomdUrl: string = process.env.BILBOMD_URL ?? 'https://bilbomd.bl1231.als.lbl.gov'

const initializeJob = async (MQJob: BullMQJob, DBjob: IBilboMDScoperJob) => {
  // Make sure the user exists in MongoDB
  const foundUser = await User.findById(DBjob.user).lean().exec()
  if (!foundUser) {
    throw new Error(`No user found for: ${DBjob.uuid}`)
  }
  // Clear the BullMQ Job logs
  await MQJob.clearLogs()
  // Set MongoDB status to Running
  DBjob.status = 'Running'
  const now = new Date()
  DBjob.time_started = now
  await DBjob.save()
}

const cleanupJob = async (MQjob: BullMQJob, DBJob: IBilboMDScoperJob) => {
  DBJob.status = 'Completed'
  DBJob.time_completed = new Date()
  await DBJob.save()
  sendJobCompleteEmail(DBJob.user.email, bilbomdUrl, DBJob.id, DBJob.title, false)
  console.log(`email notification sent to ${DBJob.user.email}`)
  await MQjob.log(`email notification sent to ${DBJob.user.email}`)
}

const processBilboMDScoperJobTest = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdScoperJob.findOne({ _id: MQjob.data.jobid })
    .populate({
      path: 'user',
      select: 'email'
    })
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)

  // Initialize
  await initializeJob(MQjob, foundJob)

  // Use PAE to construct const.inp file
  // await runPaeToConst(foundJob)

  // Use BioXTAS to calculate Rg_min and Rg_max
  // await runAutoRg(foundJob)

  // More steps that require foundJob or updatedJob

  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
}

const processBilboMDScoperJob = async (MQjob: BullMQJob) => {
  await MQjob.updateProgress(1)

  const foundJob = await BilboMdScoperJob.findOne({ _id: MQjob.data.jobid })
    .populate({
      path: 'user',
      select: 'email'
    })
    .exec()
  if (!foundJob) {
    throw new Error(`No job found for: ${MQjob.data.jobid}`)
  }
  await MQjob.updateProgress(5)

  // Initialize
  await initializeJob(MQjob, foundJob)
  await MQjob.updateProgress(10)

  // Run the Scoper IonNet pipeline
  await MQjob.log('start scoper')
  await runScoper(MQjob, foundJob)
  await MQjob.log('end scoper')
  await MQjob.updateProgress(80)

  // Combine the RNA and Mg PDB files
  await MQjob.log('start gather results')
  await prepareScoperResults(MQjob, foundJob)
  await MQjob.log('end gather results')
  await MQjob.updateProgress(90)

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
}

export { processBilboMDScoperJob, processBilboMDScoperJobTest }
