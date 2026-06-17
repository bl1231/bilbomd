import { Request, Response } from 'express'
import {
  User,
  Job as DBJob,
  MultiJob,
  UsageEvent
} from '@bilbomd/mongodb-schema'

export const getSummaryAnalytics = async (req: Request, res: Response) => {
  try {
    const [
      userCount,
      jobCount,
      multiJobCount,
      completedCount,
      failedCount,
      totalJobsSubmitted
    ] = await Promise.all([
      User.countDocuments({}).exec(),
      DBJob.countDocuments({}).exec(),
      MultiJob.countDocuments({}).exec(),
      DBJob.countDocuments({ status: 'Completed' }).exec(),
      DBJob.countDocuments({ status: 'Failed' }).exec(),
      UsageEvent.countDocuments({ event_type: 'job_submitted' }).exec()
    ])

    const perPipeline = await UsageEvent.aggregate([
      { $group: { _id: '$pipeline', count: { $sum: 1 } } },
      { $project: { pipeline: '$_id', count: 1, _id: 0 } }
    ])

    res.json({
      users: userCount,
      jobs: jobCount,
      multijobs: multiJobCount,
      jobsCompleted: completedCount,
      jobsFailed: failedCount,
      totalJobsSubmitted,
      usagePerPipeline: perPipeline
    })
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to compute summary analytics: ${error}` })
  }
}
