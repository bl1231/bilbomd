import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const deleteQueueJob = async (req: Request, res: Response): Promise<void> => {
  const { queueName, jobId } = req.params

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ error: `Queue "${queueName}" not found` })
    return
  }

  try {
    const job = await queue.getJob(jobId)
    if (!job) {
      res
        .status(404)
        .json({ error: `Job ID "${jobId}" not found in queue "${queueName}"` })
      return
    }

    await job.remove()
    res
      .status(200)
      .json({ message: `Job ID "${jobId}" removed from queue "${queueName}"` })
  } catch (error) {
    console.error(`Failed to remove job "${jobId}" from queue "${queueName}":`, error)
    res.status(500).json({ error: 'Failed to remove job from queue' })
  }
}

export default deleteQueueJob
