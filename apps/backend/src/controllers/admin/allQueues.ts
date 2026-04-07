import {
  bilbomdQueue,
  scoperQueue,
  multimdQueue,
  deleteBilboMDJobsQueue
} from '../../queues/index.js'
import { Queue } from 'bullmq'

export const allQueues: { [name: string]: Queue } = {
  bilbomd: bilbomdQueue,
  scoper: scoperQueue,
  multimd: multimdQueue,
  delete: deleteBilboMDJobsQueue
}
