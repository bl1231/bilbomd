import { Job as BullMQJob } from 'bullmq'
import { IJob } from '@bilbomd/mongodb-schema'

export const createProgressTracker = (mqJob: BullMQJob, dbJob: IJob) => ({
  async update(progress: number): Promise<void> {
    await mqJob.updateProgress(progress)
    dbJob.progress = progress
    await dbJob.save()
  }
})
