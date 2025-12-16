import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsageSuccessRate = async (req: Request, res: Response) => {
  try {
    const results = await UsageEvent.aggregate([
      {
        $match: {
          event_type: { $in: ['job_completed', 'job_failed', 'job_cancelled'] }
        }
      },
      {
        $group: {
          _id: '$pipeline',
          total: { $sum: 1 },
          successes: {
            $sum: { $cond: [{ $eq: ['$event_type', 'job_completed'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          pipeline: '$_id',
          successRate: {
            $cond: [
              { $gt: ['$total', 0] },
              { $divide: ['$successes', '$total'] },
              0
            ]
          },
          total: 1,
          _id: 0
        }
      },
      { $sort: { successRate: -1 } }
    ])
    res.json(results)
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to compute usage success rate: ${error}` })
  }
}
