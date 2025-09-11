import { Job as BullMQJob, Queue } from 'bullmq'
import { logger } from '../middleware/loggers.js'
import { BilboMDBullMQ, BullMQData, BilboMDSteps } from '../types/bilbomd.js'
import { config } from '../config/config.js'
import { redis } from './redisConn.js'

let bilbomdQueue: Queue

const getQueue = (): Queue => {
  if (!bilbomdQueue) {
    bilbomdQueue = new Queue('bilbomd', {
      connection: redis,
      defaultJobOptions: {
        attempts: config.bullmqAttempts
      }
    })
  }
  return bilbomdQueue
}

const closeQueue = async () => {
  const queue = getQueue()
  await queue.close()
  await redis.quit()
}

const queueJob = async (data: BullMQData) => {
  try {
    const queue = getQueue()

    logger.info(`${data.type} Job ${data.title} about to be added to ${queue.name} queue`)

    const bullJob = await queue.add(data.title, data)

    logger.info(`${data.type} Job added with Job ID: ${bullJob.id}`)

    return bullJob.id
  } catch (error) {
    logger.error(`Error adding ${data.type} Job to queue: ${error}`)
    throw error
  }
}

const getAllBullMQJobs = async (): Promise<BullMQJob[]> => {
  const queue = getQueue()
  const allJobs = await queue.getJobs(
    ['completed', 'failed', 'waiting', 'active', 'delayed'],
    0,
    -1,
    true
  )
  return allJobs
}

const getWaitingJobs = async (): Promise<BullMQJob[]> => {
  const queue = getQueue()
  const waitingJobs = await queue.getJobs(['waiting'], 0, -1, true)
  return waitingJobs
}

const getWaitingPosition = async (bullmq: BullMQJob): Promise<number> => {
  const waitingJobs = await getWaitingJobs()
  let position = 0

  for (let i = 0; i < waitingJobs.length; i++) {
    if (waitingJobs[i].data.uuid === bullmq.data.uuid) {
      position = i + 1
      break
    } else {
      // logger.info(`Job ${waitingJobs[i].data.uuid} is not the same as ${bullmq.data.uuid}`)
      // logger.info(`Position: ${position}`)
    }
  }

  return position
}

const getWaitingPositionText = async (bullmq: BullMQJob): Promise<string> => {
  const position = await getWaitingPosition(bullmq)
  const totalNumberWaiting = await getWaitingCount()
  if (position === 0) {
    return ''
  }
  return `${position} out of ${totalNumberWaiting}`
}

const getBullMQJob = async (UUID: string): Promise<BilboMDBullMQ | undefined> => {
  const allJobs: BullMQJob[] = await getAllBullMQJobs()

  const bulljob = allJobs.find((job) => {
    return job.data.uuid === UUID
  })

  if (bulljob) {
    // calculate position as a number
    const position = (await getWaitingPosition(bulljob)) ?? '0'
    // calculate queuePosition as a text string
    const queuePosition = (await getWaitingPositionText(bulljob)) ?? '0'
    // append bilbomdStep
    const steps = (await updateBilboMDSteps(bulljob)) ?? '{}'
    // append bilbomdLastStep
    const msg = (await updateBilboMDInfo(bulljob)) ?? 'error'
    // Put it all together
    const bilboMDBullMQJob: BilboMDBullMQ = {
      position: position,
      queuePosition: queuePosition,
      bilbomdStep: steps,
      bilbomdLastStep: msg,
      bullmq: bulljob
    }
    // logger.info(bilboMDBullMQJob)
    return bilboMDBullMQJob
  }

  return undefined
}

const bilboSteps: BilboMDSteps = {
  pae: '',
  autorg: '',
  minimize: 'no',
  heat: 'no',
  md: 'no',
  foxs: 'no',
  multifoxs: 'no',
  results: 'no',
  email: 'no',
  numEnsembles: 0
}

const updateBilboMDSteps = async (bullmq: BullMQJob): Promise<BilboMDSteps> => {
  let logData: { count: number; logs: string[] }
  const queue = getQueue()

  if (bullmq.id) {
    logData = await queue.getJobLogs(bullmq.id, 0, -1, true)
  } else {
    logData = { count: 0, logs: [''] }
  }
  const logEntries = logData.logs

  const updatedSteps = await updateStepStatus(logEntries, bilboSteps)
  return updatedSteps
}

const updateBilboMDInfo = async (bullmq: BullMQJob): Promise<string> => {
  let logData: { count: number; logs: string[] }
  const queue = getQueue()

  if (bullmq.id) {
    logData = await queue.getJobLogs(bullmq.id, 0, -1, true)
  } else {
    logData = { count: 0, logs: [''] }
  }
  const logEntries = logData.logs
  let lastLogMessage: string = ''

  if (logEntries.length > 0) {
    lastLogMessage = logEntries[logEntries.length - 1]
  }
  return lastLogMessage
}

const updateStepStatus = async (
  jobLogs: string[],
  steps: BilboMDSteps
): Promise<BilboMDSteps> => {
  const updatedSteps = { ...steps } // Create a copy of the original steps object

  jobLogs.forEach((logLine) => {
    if (logLine.includes('start pae')) {
      updatedSteps.pae = 'start'
    } else if (logLine.includes('start autorg')) {
      updatedSteps.autorg = 'start'
    } else if (logLine.includes('start minimize')) {
      updatedSteps.minimize = 'start'
    } else if (logLine.includes('start heat')) {
      updatedSteps.heat = 'start'
    } else if (logLine.includes('start md')) {
      updatedSteps.md = 'start'
    } else if (logLine.includes('start foxs')) {
      updatedSteps.foxs = 'start'
    } else if (logLine.includes('start multifoxs')) {
      updatedSteps.multifoxs = 'start'
    } else if (logLine.includes('start results')) {
      updatedSteps.results = 'start'
    } else if (logLine.includes('end pae')) {
      updatedSteps.pae = 'end'
    } else if (logLine.includes('end autorg')) {
      updatedSteps.autorg = 'end'
    } else if (logLine.includes('end minimize')) {
      updatedSteps.minimize = 'end'
    } else if (logLine.includes('end heat')) {
      updatedSteps.heat = 'end'
    } else if (logLine.includes('end md')) {
      updatedSteps.md = 'end'
    } else if (logLine.includes('end foxs')) {
      updatedSteps.foxs = 'end'
    } else if (logLine.includes('end multifoxs')) {
      updatedSteps.multifoxs = 'end'
    } else if (logLine.includes('end results')) {
      updatedSteps.results = 'end'
    } else if (logLine.includes('email notification sent to')) {
      updatedSteps.email = 'end'
    } else if (logLine.includes('error pae')) {
      updatedSteps.pae = 'error'
    } else if (logLine.includes('error autorg')) {
      updatedSteps.autorg = 'error'
    } else if (logLine.includes('error minimize')) {
      updatedSteps.minimize = 'error'
    } else if (logLine.includes('error heat')) {
      updatedSteps.heat = 'error'
    } else if (logLine.includes('error md')) {
      updatedSteps.md = 'error'
    } else if (logLine.includes('error foxs')) {
      updatedSteps.foxs = 'error'
    } else if (logLine.includes('error multifoxs')) {
      updatedSteps.multifoxs = 'error'
    } else if (logLine.includes('error results')) {
      updatedSteps.results = 'error'
    }
  })

  return updatedSteps
}

const getActiveCount = async () => {
  const queue = getQueue()
  const num = await queue.getActiveCount()
  return num
}

const getWaitingCount = async () => {
  const queue = getQueue()
  const num = await queue.getWaitingCount()
  return num
}

const getWorkers = async () => {
  const queue = getQueue()
  const workers = await queue.getWorkers()
  return workers
}

const queue = getQueue()

export {
  queueJob,
  queue as bilbomdQueue,
  closeQueue,
  getWaitingJobs,
  getBullMQJob,
  getActiveCount,
  getWaitingCount,
  getWorkers
}
