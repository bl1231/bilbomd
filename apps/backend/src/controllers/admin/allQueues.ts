import {
  bilbomdQueue,
  scoperQueue,
  multimdQueue,
  pdb2crdQueue,
  deleteBilboMDJobsQueue
} from '../../queues/index.js'
import { Queue } from 'bullmq'

export const allQueues: { [name: string]: Queue } = {
  bilbomd: bilbomdQueue,
  scoper: scoperQueue,
  multimd: multimdQueue,
  pdb2crd: pdb2crdQueue,
  delete: deleteBilboMDJobsQueue
}
