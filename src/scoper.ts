// index.ts
import { serve } from 'bun'
import { Job, Worker, WorkerOptions } from 'bullmq'
import { WorkerJob } from './bullmq.jobs.ts'

const PORT = 3006

const workerHandler = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case 'BilboMDScoper': {
      console.log('Start BilboMD Scoper job:', job.name)
      // await processBilboMDJob(job)
      console.log('Finish job:', job.name)
      return
    }
  }
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
const worker = new Worker('bilbomd', workerHandler, workerOptions)

console.log('Worker started!')
// console.log(Bun.version)

serve({
  port: PORT,
  fetch: async (req: Request) => {
    // Log the request URL
    console.log('URL:', req.url)
    const result = await spawnTest()
    return new Response(result)
  }
})

const spawnTest = async () => {
  const proc = Bun.spawn(['python', 'scripts/test.py'])
  const text = await new Response(proc.stdout).text()
  console.log(text)
  return text
}
