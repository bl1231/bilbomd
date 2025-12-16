import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsageAccessModeSplit = async (req: Request, res: Response) => {
  try {
    const results = await UsageEvent.aggregate([
      {
        $group: {
          _id: { pipeline: '$pipeline', mode: '$context.access_mode' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          pipeline: '$_id.pipeline',
          access_mode: '$_id.mode',
          count: 1,
          _id: 0
        }
      },
      { $sort: { pipeline: 1, access_mode: 1 } }
    ])
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute usage access mode split' })
  }
}
