import { Request, Response } from 'express'
import { Job as DBJob } from '@bilbomd/mongodb-schema'

export const getJobsByStatus = async (req: Request, res: Response) => {
  try {
    const results = await DBJob.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ])
    res.json(results)
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to compute jobs by status: ${error}` })
  }
}
