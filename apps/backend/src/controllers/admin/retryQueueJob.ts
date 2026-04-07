import { Request, Response } from 'express'
import { Job } from 'bullmq'
import { allQueues } from './allQueues.js'
import { logger } from '../../middleware/loggers.js'

const retryQueueJob = async (req: Request, res: Response): Promise<void> => {
  const { queueName: rawQueueName, jobId: rawJobId } = req.params

  // Ensure parameters are strings
  const queueName = Array.isArray(rawQueueName) ? rawQueueName[0] : rawQueueName
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ error: `Queue "${queueName}" not found` })
    return
  }

  try {
    const job: Job | undefined = await queue.getJob(jobId)
    if (!job) {
      res
        .status(404)
        .json({ error: `Job "${jobId}" not found in queue "${queueName}"` })
      return
    }

    await job.retry()
    res
      .status(200)
      .json({
        message: `Job "${jobId}" retried successfully in queue "${queueName}"`
      })
  } catch (error) {
    logger.error(`Failed to retry job "${jobId}" in queue "${queueName}": ${error}`)
    res.status(500).json({ error: 'Failed to retry job' })
  }
}

export default retryQueueJob
