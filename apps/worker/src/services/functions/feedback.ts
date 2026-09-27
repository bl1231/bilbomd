import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import fs from 'fs-extra'
import { IJob } from '@bilbomd/mongodb-schema'
import path from 'path'

const spawnFeedbackScript = async (DBjob: IJob): Promise<void> => {
  const resultsDir = path.join(config.uploadDir, DBjob.uuid, 'results')

  await runProcess({
    label: 'Feedback script',
    cmd: '/opt/envs/base/bin/python',
    args: ['/app/scripts/pipeline_decision_tree.py', resultsDir],
    cwd: resultsDir,
    stdoutFile: path.join(resultsDir, 'feedback.log'),
    stderrFile: path.join(resultsDir, 'feedback_error.log'),
    timeoutMs: config.processTimeouts.helperScriptMs,
    onStdoutLine: (line) => logger.info(`Feedback script stdout: ${line}`),
    onStderrLine: (line) => logger.error(`Feedback script stderr: ${line}`)
  })
  logger.info('Feedback script completed successfully')

  // Read and save feedback.json to DBjob
  const feedbackFilePath = path.join(resultsDir, 'feedback.json')
  try {
    const feedbackData = await fs.promises.readFile(feedbackFilePath, 'utf-8')
    const feedbackJSON = JSON.parse(feedbackData)

    logger.info(
      `Parsed feedback data for job ${DBjob.uuid}: ${JSON.stringify(feedbackJSON)}`
    )

    DBjob.feedback = feedbackJSON
    await DBjob.save()

    logger.info(`Feedback data saved to MongoDB for job ${DBjob.uuid}`)
  } catch (err) {
    logger.error(
      `Failed to read or parse feedback.json for job ${DBjob.uuid}: ${err}`
    )
    throw err
  }
}

export { spawnFeedbackScript }
