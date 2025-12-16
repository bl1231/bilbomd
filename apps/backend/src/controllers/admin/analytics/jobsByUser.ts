import { Request, Response } from 'express'
import { Job as DBJob } from '@bilbomd/mongodb-schema'

export const getJobsByUser = async (req: Request, res: Response) => {
  try {
    const results = await DBJob.aggregate([
      { $match: { 'user._id': { $ne: null } } },
      { $group: { _id: '$user._id', count: { $sum: 1 } } },
      { $project: { userId: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ])
    res.json(results)
  } catch (error) {
    res.status(500).json({ error: `Failed to compute jobs by user: ${error}` })
  }
}
