// Redis pub/sub channel the backend publishes to when a job should stop
// (e.g. the user deleted it) and every worker subscribes to.
export const JOB_CANCEL_CHANNEL = 'bilbomd:cancel-job'

export interface JobCancelMessage {
  // MongoDB _id of the Job / MultiJob; matches `jobid` in the BullMQ job data
  jobid: string
  reason: string
}
