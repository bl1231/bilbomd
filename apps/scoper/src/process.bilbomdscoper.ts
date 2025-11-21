import { logger } from './helpers/loggers.js'
import { Job as BullMQJob } from 'bullmq'
import { IBilboMDScoperJob, BilboMdScoperJob } from '@bilbomd/mongodb-schema'
import { sendJobCompleteEmail } from './helpers/mailer.js'
import { runScoper, prepareScoperResults } from './scoper.functions.js'
import { config } from './config/config.js'

const bilbomdUrl: string =
  process.env.BILBOMD_URL ?? 'https://bilbomd.bl1231.als.lbl.gov'

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

const initializeJob = async (MQJob: BullMQJob, DBjob: IBilboMDScoperJob) => {
  try {
    await MQJob.clearLogs()
    DBjob.status = 'Running'
    const now = new Date()
    DBjob.time_started = now
    await DBjob.save()
  } catch (error) {
    logger.error(`Error in initializeJob: ${getErrorMessage(error)}`)
    throw error
  }
}

const cleanupJob = async (MQjob: BullMQJob, DBJob: IBilboMDScoperJob) => {
  DBJob.status = 'Completed'
  DBJob.time_completed = new Date()
  await DBJob.save()

  // Send job completion email and log the notification
  if (config.sendEmailNotifications) {
    if (typeof DBJob.user !== 'object' || !('email' in DBJob.user)) {
      throw new Error(`User details are not populated for job: ${DBJob.id}`)
    }
    sendJobCompleteEmail(
      DBJob.user.email,
      bilbomdUrl,
      DBJob.id,
      DBJob.title,
      false
    )
    logger.info(`email notification sent to ${DBJob.user.email}`)
    await MQjob.log(`email notification sent to ${DBJob.user.email}`)
  } else {
    logger.info(`email notifications are disabled`)
  }
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

  // Calculate Rg_min and Rg_max
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
  foundJob.progress = 5
  await foundJob.save()

  // Initialize
  await initializeJob(MQjob, foundJob)
  await MQjob.updateProgress(10)
  foundJob.progress = 10
  await foundJob.save()

  // Run the Scoper IonNet pipeline
  await runScoper(MQjob, foundJob)
  await MQjob.updateProgress(80)
  foundJob.progress = 80
  await foundJob.save()

  // Combine the RNA and Mg PDB files
  await prepareScoperResults(MQjob, foundJob)
  await MQjob.updateProgress(90)
  foundJob.progress = 90
  await foundJob.save()

  // Cleanup & send email
  await cleanupJob(MQjob, foundJob)
  await MQjob.updateProgress(100)
  foundJob.progress = 100
  await foundJob.save()
}

export { processBilboMDScoperJob, processBilboMDScoperJobTest }
