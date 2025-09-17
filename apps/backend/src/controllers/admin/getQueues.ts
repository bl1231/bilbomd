import { Request, Response } from 'express'
import { allQueues } from './allQueues.js'

const getQueues = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Promise.all(
      Object.entries(allQueues).map(async ([name, queue]) => {
        const counts = await queue.getJobCounts()
        const isPaused = await queue.isPaused()
        return { name, jobCounts: counts, isPaused }
      })
    )
    // console.log(JSON.stringify(result, null, 2))
    res.json(result)
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.status(500).json({ message: 'Failed to fetch queue data', error: err.message })
    } else {
      res
        .status(500)
        .json({ message: 'Failed to fetch queue data', error: 'Unknown error' })
    }
  }
}

export { getQueues }
