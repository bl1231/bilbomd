import { Request, Response } from 'express'
import { Job as DBJob } from '@bilbomd/mongodb-schema'
import { discriminatorToPipeline } from '@bilbomd/md-utils'
import { logger } from '../../../middleware/loggers.js'

export const getJobsByType = async (req: Request, res: Response) => {
  try {
    const results = await DBJob.aggregate([
      { $group: { _id: '$__t', count: { $sum: 1 } } },
      {
        $project: {
          pipeline: {
            $toLower: {
              $replaceAll: { input: '$_id', find: 'BilboMd', replacement: '' }
            }
          },
          count: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ])
    res.json(
      results.map((r) => ({
        pipeline: discriminatorToPipeline(r.pipeline),
        count: r.count
      }))
    )
  } catch (error) {
    logger.error(`Failed to compute jobs by type: ${error}`)
    res.status(500).json({ error: `Failed to compute jobs by type: ${error}` })
  }
}
