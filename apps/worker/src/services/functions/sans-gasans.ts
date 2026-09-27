import path from 'path'
import { Job as BullMQJob } from 'bullmq'
import { IStepStatus, IBilboMDSANSJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { updateStepStatus } from './mongo-utils.js'

const runGASANS = async (
  MQjob: BullMQJob,
  DBjob: IBilboMDSANSJob
): Promise<void> => {
  const workingDir = path.join(config.uploadDir, DBjob.uuid)
  const gasansOpts = ['/app/scripts/sans/GASANS-dask.py']

  // Paths to log files
  const stdoutLog = path.join(workingDir, 'gasans.log')
  const stderrLog = path.join(workingDir, 'gasans-error.log')

  let status: IStepStatus = {
    status: 'Running',
    message: 'GA-SANS analysis has started.'
  }
  try {
    await updateStepStatus(DBjob, 'gasans', status)

    await runProcess({
      label: 'GA-SANS',
      cmd: '/opt/envs/base/bin/python',
      args: gasansOpts,
      cwd: workingDir,
      stdoutFile: stdoutLog,
      stderrFile: stderrLog,
      appendLogs: true,
      timeoutMs: config.processTimeouts.gasansMs,
      heartbeat: MQjob && {
        intervalMs: 10_000,
        onBeat: () => {
          MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
          MQjob.log(`Heartbeat: still running GA-SANS`)
          logger.info(
            `runGASANS Heartbeat: still running GA-SANS for: ${
              DBjob.title
            } at ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
          )
        }
      }
    })
    logger.info('GASANS process completed successfully')

    status = {
      status: 'Success',
      message: 'GA-SANS analysis has completed successfully.'
    }
    await updateStepStatus(DBjob, 'gasans', status)
  } catch (error) {
    status = {
      status: 'Error',
      message: `GA-SANS analysis failed: ${(error as Error).message}`
    }
    await updateStepStatus(DBjob, 'gasans', status)
    logger.error(`Error during GASANS analysis: ${(error as Error).message}`)
    throw error
  }
}

export { runGASANS }
