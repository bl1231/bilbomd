import { Request, Response } from 'express'
import { downloadJobResults } from '../jobs/downloadJobResults.js'
import { logger } from '../../middleware/loggers.js'

export const getExternalJobResults = async (req: Request, res: Response) => {
  try {
    logger.info(
      `External API request to download job results for job ID ${req.params.id}`
    )
    await downloadJobResults(req, res)
    logger.info(`Completed external job result download for job ID ${req.params.id}`)
  } catch (err) {
    logger.error(`getExternalJobResults error: ${err}`)
    res
      .status(500)
      .json({ message: 'Unexpected error during external job result download.' })
  }
}
