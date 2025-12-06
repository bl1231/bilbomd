import * as dotenv from 'dotenv'
import { logger } from './helpers/loggers.js'
import { connectDB } from './helpers/db.js'
import { Job, Worker, WorkerOptions } from 'bullmq'
import { BilboMDScoperJobData } from './bullmq.jobs.js'
import { processBilboMDScoperJob } from './process.bilbomdscoper.js'
import { redis } from './helpers/redis.js'

dotenv.config()

connectDB()

const workerHandler = async (job: Job<BilboMDScoperJobData>) => {
  logger.info(
    `Start BilboMDScoper job Title: ${job.name} UUID: ${job.data.uuid}`
  )
  await processBilboMDScoperJob(job)
  logger.info(
    `Finish BilboMDScoper job Title: ${job.name} UUID: ${job.data.uuid}`
  )
}

const workerOptions: WorkerOptions = {
  connection: redis,
  concurrency: 1,
  lockDuration: 90000
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const bilboMdScoperWorker = new Worker('scoper', workerHandler, workerOptions)

logger.info('Scoper worker started!')
logger.info(`Concurrency: ${workerOptions.concurrency}`)
logger.info(`SEND_EMAIL_USER: ${process.env.SEND_EMAIL_USER}`)
logger.info(`SEND_EMAIL_NOTIFICATIONS: ${process.env.SEND_EMAIL_NOTIFICATIONS}`)
logger.info(`SCOPER_KGS_CONFORMERS: ${process.env.SCOPER_KGS_CONFORMERS}`)
