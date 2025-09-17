import { Request, Response } from 'express'
import { Job } from 'bullmq'
import { allQueues } from './allQueues.js'

const retryQueueJob = async (req: Request, res: Response): Promise<void> => {
  const { queueName, jobId } = req.params

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ error: `Queue "${queueName}" not found` })
    return
  }

  try {
    const job: Job | undefined = await queue.getJob(jobId)
    if (!job) {
      res.status(404).json({ error: `Job "${jobId}" not found in queue "${queueName}"` })
      return
    }

    await job.retry()
    res
      .status(200)
      .json({ message: `Job "${jobId}" retried successfully in queue "${queueName}"` })
  } catch (error) {
    console.error(`Failed to retry job "${jobId}" in queue "${queueName}":`, error)
    res.status(500).json({ error: 'Failed to retry job' })
  }
}

export default retryQueueJob
