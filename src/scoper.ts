import * as dotenv from 'dotenv'
import { logger } from './helpers/loggers'
import { connectDB } from './helpers/db'
import { Job, Worker, WorkerOptions } from 'bullmq'
import { BilboMDScoperJobData } from './bullmq.jobs'
import { processBilboMDScoperJob } from './process.bilbomdscoper'

dotenv.config()

connectDB()

// let bilboMdScoperWorker: Worker

const workerHandler = async (job: Job<BilboMDScoperJobData>) => {
  logger.info(`Start BilboMDScoper job Title: ${job.name} UUID: ${job.data.uuid}`)
  await processBilboMDScoperJob(job)
  logger.info(`Finish BilboMDScoper job Title: ${job.name} UUID: ${job.data.uuid}`)
}

const workerOptions: WorkerOptions = {
  connection: {
    host: 'redis',
    port: 6379
  },
  concurrency: 1,
  lockDuration: 90000
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const bilboMdScoperWorker = new Worker('bilbomd-scoper', workerHandler, workerOptions)

logger.info('Scoper worker started!')
logger.info(`Concurrency: ${workerOptions.concurrency}`)
logger.info(`SEND_EMAIL_USER: ${process.env.SEND_EMAIL_USER}`)
logger.info(`SEND_EMAIL_NOTIFICATIONS: ${process.env.SEND_EMAIL_NOTIFICATIONS}`)
logger.info(`SCOPER_KGS_CONFORMERS: ${process.env.SCOPER_KGS_CONFORMERS}`)
