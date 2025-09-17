import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'

export const handleOrcidConfirmation = (req: Request, res: Response) => {
  const data = req.session.orcidProfile

  if (!data) {
    res.status(400).json({ message: 'Missing ORCID session data' })
    return
  }
  logger.info(`ORCID confirmation session data: ${JSON.stringify(data)}`)

  res.status(200).json(data)
}
