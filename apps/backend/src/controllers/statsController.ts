import { Request, Response } from 'express'
import { logger } from '../middleware/loggers.js'
import { User, Job } from '@bl1231/bilbomd-mongodb-schema'

const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await User.countDocuments({}).exec()
    const jobCount = await Job.countDocuments({}).exec()

    // Sum jobCount from all users
    const usersJobCountAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          totalJobsFromUsers: { $sum: '$jobCount' }
        }
      }
    ])
    const totalJobsFromUsers = usersJobCountAgg[0]?.totalJobsFromUsers ?? 0

    // Aggregate jobTypes from all users
    const jobTypesAgg = await User.aggregate([
      {
        $project: {
          jobTypesArray: { $objectToArray: '$jobTypes' }
        }
      },
      { $unwind: '$jobTypesArray' },
      {
        $group: {
          _id: '$jobTypesArray.k',
          count: { $sum: '$jobTypesArray.v' }
        }
      }
    ])

    // Convert the aggregation result into a clean object
    const jobTypes: Record<string, number> = {}
    jobTypesAgg.forEach((entry) => {
      jobTypes[entry._id] = entry.count
    })

    res.json({
      success: true,
      data: {
        userCount,
        jobCount,
        totalJobsFromUsers,
        jobTypes
      }
    })
  } catch (error) {
    logger.error(`Failed to get stats: ${error}`)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

export { getStats }
