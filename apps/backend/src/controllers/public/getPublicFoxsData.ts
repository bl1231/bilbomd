import { Request, Response } from 'express'
import { logger } from '../../middleware/loggers.js'
import { Job } from '@bilbomd/mongodb-schema'
import { getFoxsBilboData } from '../downloadController.js'

const getPublicFoxsData = async (req: Request, res: Response) => {
  const { publicId } = req.params

  if (!publicId) {
    res.status(400).json({ message: 'publicId is required.' })
    return
  }

  try {
    // Only allow access to anonymous jobs via publicId
    const job = await Job.findOne({
      public_id: publicId,
      access_mode: 'anonymous'
    }).exec()

    if (!job) {
      res
        .status(404)
        .json({ message: `No anonymous job matches publicId ${publicId}.` })
      return
    }
    await getFoxsBilboData(job, res)

    // if (job.__t === 'BilboMdScoper') {
    //   const scoperJob = job as unknown as IBilboMDScoperJob
    //   await getFoxsScoperData(scoperJob, res)
    // } else {
    //   await getFoxsBilboData(job, res)
    // }
  } catch (error) {
    console.error(`Error getting FoXS data: ${error}`)
    logger.error(`Error getting FoXS data: ${error}`)
    res.status(500).json({ message: 'Error processing FoXS data.' })
  }
}
export default getPublicFoxsData
