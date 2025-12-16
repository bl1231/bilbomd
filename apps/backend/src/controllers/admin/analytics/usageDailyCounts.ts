import { Request, Response } from 'express'
import { UsageEvent } from '@bilbomd/mongodb-schema'

export const getUsageDailyCounts = async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query as Record<string, string>
    const match: Record<string, unknown> = {}
    if (start || end) {
      match['timestamp'] = {}
      if (start)
        (match['timestamp'] as Record<string, Date>)['$gte'] = new Date(start)
      if (end)
        (match['timestamp'] as Record<string, Date>)['$lte'] = new Date(end)
    }

    const results = await UsageEvent.aggregate([
      { $match: match },
      {
        $project: {
          pipeline: 1,
          day: { $dateTrunc: { unit: 'day', date: '$timestamp' } }
        }
      },
      {
        $group: {
          _id: { pipeline: '$pipeline', day: '$day' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          pipeline: '$_id.pipeline',
          day: { $dateToString: { date: '$_id.day', format: '%Y-%m-%d' } },
          count: 1,
          _id: 0
        }
      },
      { $sort: { day: 1, pipeline: 1 } }
    ])
    res.json(results)
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to compute usage daily counts: ${error}` })
  }
}
