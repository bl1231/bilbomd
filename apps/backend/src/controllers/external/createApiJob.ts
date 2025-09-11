import { logger } from '../../middleware/loggers.js'
import { Request, Response } from 'express'
import { createNewJob } from '../jobs/index.js'

export const createApiJob = async (req: Request, res: Response) => {
  try {
    const user = req.apiUser

    if (!user) {
      res.status(403).json({ message: 'Missing API user context' })
      return
    }

    // Optional: Attach email to req so createNewJob logic stays unified
    req.email = user.email

    // Optional: Add API-specific metadata or logging
    logger.info(`API job submission from ${req.email}`)

    await createNewJob(req, res)
  } catch (err) {
    logger.error('createApiJob error:', err)
    res.status(500).json({ message: 'Failed to submit API job' })
  }
}
