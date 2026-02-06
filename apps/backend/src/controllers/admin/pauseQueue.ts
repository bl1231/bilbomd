import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const pauseQueue = async (req: Request, res: Response): Promise<void> => {
  const rawQueueName = req.params.queueName

  // Ensure queueName is a string
  const queueName = Array.isArray(rawQueueName) ? rawQueueName[0] : rawQueueName

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ message: `Queue "${queueName}" not found` })
    return
  }

  try {
    await queue.pause()
    res.status(200).json({ message: `Queue "${queueName}" paused` })
  } catch (err: unknown) {
    if (err instanceof Error) {
      res
        .status(500)
        .json({ message: 'Failed to pause queue', error: err.message })
    } else {
      res
        .status(500)
        .json({ message: 'Failed to pause queue', error: 'Unknown error' })
    }
  }
}

export { pauseQueue }
