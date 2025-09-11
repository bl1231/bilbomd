import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const failQueueJob = async (req: Request, res: Response): Promise<void> => {
  const { queueName, jobId } = req.params

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ message: `Queue "${queueName}" not found` })
    return
  }

  try {
    const job = await queue.getJob(jobId)
    if (!job) {
      res
        .status(404)
        .json({ message: `Job "${jobId}" not found in queue "${queueName}"` })
      return
    }

    const reason = req.body?.reason || 'Manually marked as failed'
    await job.moveToFailed(new Error(reason), 'admin-fail')

    res
      .status(200)
      .json({ message: `Job "${jobId}" in queue "${queueName}" marked as failed` })
  } catch (error) {
    console.error(`Failed to fail job "${jobId}" in queue "${queueName}"`, error)
    res.status(500).json({
      message: `Failed to fail job "${jobId}" in queue "${queueName}"`,
      error: (error as Error).message
    })
  }
}

export default failQueueJob
