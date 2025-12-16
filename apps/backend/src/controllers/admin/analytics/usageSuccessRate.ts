import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsageSuccessRate = async (req: Request, res: Response) => {
  try {
    const terminal = await UsageEvent.aggregate([
      {
        $match: {
          eventType: { $in: ['job_completed', 'job_failed', 'job_cancelled'] }
        }
      },
      {
        $group: {
          _id: '$pipeline',
          total: { $sum: 1 },
          successes: {
            $sum: { $cond: [{ $eq: ['$eventType', 'job_completed'] }, 1, 0] }
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
    res.json(terminal)
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute usage success rate' })
  }
}
