import * as dotenv from 'dotenv'
import { connectDB } from './db.js'
import { Job, Worker, WorkerOptions } from 'bullmq'
import { BilboMDScoperJobData } from './bullmq.jobs.js'
import { processBilboMDScoperJob } from './process.bilbomdscoper.js'

dotenv.config()

connectDB()

const workerHandler = async (job: Job<BilboMDScoperJobData>) => {
  console.log('Start BilboMDScoper job:', job.name, job.data.uuid)
  await processBilboMDScoperJob(job)
  console.log('Finished BilboMDScoper Job:', job.name)
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
const worker = new Worker('bilbomd-scoper', workerHandler, workerOptions)

console.log('Scoper worker started!')
