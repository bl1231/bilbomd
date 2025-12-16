import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsagePerPipeline = async (req: Request, res: Response) => {
  try {
    const results = await UsageEvent.aggregate([
      { $group: { _id: '$pipeline', count: { $sum: 1 } } },
      { $project: { pipeline: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ])
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute usage per pipeline' })
  }
}
