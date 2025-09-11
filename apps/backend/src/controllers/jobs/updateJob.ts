import { Job } from '@bl1231/bilbomd-mongodb-schema'
import { Request, Response } from 'express'

const updateJobStatus = async (req: Request, res: Response) => {
  const { id, email, status } = req.body

  // Confirm data
  if (!id || !email || !status) {
    res.status(400).json({ message: 'All fields are required' })
  }

  // Confirm job exists to update
  const job = await Job.findById(id).exec()

  if (!job) {
    res.status(400).json({ message: 'Job not found' })
    return
  }

  if (job.status == status) {
    res.status(400).json({ message: 'nothing to do' })
  }

  // Go ahead and update status
  job.status = status

  const updatedJob = await job.save()

  res.json(`'${updatedJob.title}' updated`)
}

export { updateJobStatus }
