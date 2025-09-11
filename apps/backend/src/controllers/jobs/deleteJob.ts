import { logger } from '../../middleware/loggers.js'
import mongoose from 'mongoose'
import { Request, Response } from 'express'
import { deleteBilboMDJobsQueue } from '../../queues/delete-bilbomd-jobs.js'

const deleteJob = async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id) {
    res.status(400).json({ message: 'Job ID required' })
    return
  }
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid Job ID format' })
    return
  }

  try {
    await deleteBilboMDJobsQueue.add('delete-bilbomd-job', {
      mongoId: id
    })

    res.status(202).json({ message: `Deletion of job ${id} has been queued.` })
  } catch (error) {
    logger.error(`Error queuing job deletion: ${error}`)
    res.status(500).json({ message: 'Failed to queue job deletion' })
  }
}

export { deleteJob }
