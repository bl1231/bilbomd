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
  logger.info(`Start BilboMDScoper job: ${job.name}  ${job.data.uuid}`)
  await processBilboMDScoperJob(job)
  logger.info(`Finished BilboMDScoper Job: ${job.name}`)
}

const workerOptions: WorkerOptions = {
  connection: {
    host: 'redis',
    port: 6379
  },
  concurrency: 2,
  lockDuration: 90000
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const bilboMdScoperWorker = new Worker('bilbomd-scoper', workerHandler, workerOptions)

logger.info('Scoper worker started!')
