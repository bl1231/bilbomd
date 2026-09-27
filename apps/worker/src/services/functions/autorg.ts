import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { IBilboMDAutoJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { getErrorMessage } from '../../helpers/errors.js'
import { updateStepStatus } from './mongo-utils.js'

const runAutoRg = async (DBjob: IBilboMDAutoJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const tempOutputFile = path.join(os.tmpdir(), `autoRg_${Date.now()}.json`)

  logger.info(`Starting autorg for job ${DBjob.uuid}`)
  await updateStepStatus(DBjob, 'autorg', {
    status: 'Running',
    message: 'Calculate Rg has started.'
  })

  try {
    await runProcess({
      label: 'AutoRg',
      cmd: '/opt/envs/base/bin/python',
      args: ['/app/scripts/autorg.py', DBjob.data_file, tempOutputFile],
      cwd: outputDir,
      stdoutFile: path.join(outputDir, 'autoRg.log'),
      stderrFile: path.join(outputDir, 'autoRg_error.log'),
      timeoutMs: config.processTimeouts.helperScriptMs
    })
  } catch (error) {
    await updateStepStatus(DBjob, 'autorg', {
      status: 'Error',
      message: getErrorMessage(error)
    })
    await fs.remove(tempOutputFile)
    throw error
  }

  try {
    const analysisResults = JSON.parse(
      await fs.promises.readFile(tempOutputFile, 'utf-8')
    )
    DBjob.rg = analysisResults.rg
    DBjob.rg_min = analysisResults.rg_min
    DBjob.rg_max = analysisResults.rg_max
    await DBjob.save()
  } finally {
    await fs.remove(tempOutputFile)
  }

  await updateStepStatus(DBjob, 'autorg', {
    status: 'Success',
    message: 'Calculate Rg completed successfully.'
  })
  logger.info(`Completed autorg for job ${DBjob.uuid}`)
}

export { runAutoRg }
