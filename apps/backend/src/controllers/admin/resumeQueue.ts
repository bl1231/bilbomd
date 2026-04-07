import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const resumeQueue = async (req: Request, res: Response): Promise<void> => {
  const rawQueueName = req.params.queueName

  // Ensure queueName is a string
  const queueName = Array.isArray(rawQueueName) ? rawQueueName[0] : rawQueueName

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ message: `Queue "${queueName}" not found` })
    return
  }

  try {
    await queue.resume()
    res.status(200).json({ message: `Queue "${queueName}" resumed` })
  } catch (err: unknown) {
    if (err instanceof Error) {
      res
        .status(500)
        .json({ message: 'Failed to resume queue', error: err.message })
    } else {
      res
        .status(500)
        .json({ message: 'Failed to resume queue', error: 'Unknown error' })
    }
  }
}

export { resumeQueue }
