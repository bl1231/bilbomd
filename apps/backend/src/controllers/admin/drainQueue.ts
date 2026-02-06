import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const drainQueue = async (req: Request, res: Response): Promise<void> => {
  const rawQueueName = req.params.queueName

  // Ensure queueName is a string
  const queueName = Array.isArray(rawQueueName) ? rawQueueName[0] : rawQueueName

  const queue = allQueues[queueName]
  if (!queue) {
    res.status(404).json({ error: `Queue "${queueName}" not found` })
    return
  }

  try {
    await queue.drain()
    res
      .status(200)
      .json({ message: `Queue "${queueName}" drained successfully` })
  } catch (error) {
    console.error(`Failed to drain queue "${queueName}":`, error)
    res.status(500).json({ error: 'Failed to drain queue' })
  }
}

export default drainQueue
