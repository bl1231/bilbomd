import { Request, Response } from 'express'
import { Job as DBJob } from '@bilbomd/mongodb-schema'

export const getJobsTimeSeries = async (req: Request, res: Response) => {
  try {
    const {
      start,
      end,
      granularity = 'day',
      status,
      type
    } = req.query as Record<string, string>

    const match: Record<string, unknown> = {}
    if (start || end) {
      match['createdAt'] = {}
      if (start)
        (match['createdAt'] as Record<string, Date>)['$gte'] = new Date(start)
      if (end)
        (match['createdAt'] as Record<string, Date>)['$lte'] = new Date(end)
    }
    if (status) match['status'] = status
    if (type) match['__t'] = { $regex: new RegExp(`BilboMd${type}`, 'i') }

    const results = await DBJob.aggregate([
      { $match: match },
      {
        $project: {
          bucket: { $dateTrunc: { unit: granularity, date: '$createdAt' } }
        }
      },
      { $group: { _id: '$bucket', count: { $sum: 1 } } },
      {
        $project: {
          day: { $dateToString: { date: '$_id', format: '%Y-%m-%d' } },
          count: 1,
          _id: 0
        }
      },
      { $sort: { day: 1 } }
    ])
    res.json(results)
  } catch {
    res.status(500).json({ error: 'Failed to compute jobs time series' })
  }
}
