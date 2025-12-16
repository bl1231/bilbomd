import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsageDurationStats = async (req: Request, res: Response) => {
  try {
    const results = await UsageEvent.aggregate([
      { $match: { event_type: 'job_completed', duration_ms: { $gt: 0 } } },
      {
        $group: {
          _id: '$pipeline',
          avgMs: { $avg: '$duration_ms' },
          count: { $sum: 1 }
        }
      },
      { $project: { pipeline: '$_id', avgMs: 1, count: 1, _id: 0 } },
      { $sort: { avgMs: 1 } }
    ])
    res.json(results)
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to compute usage duration stats: ${error}` })
  }
}
