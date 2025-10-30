import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'fs-extra'
import { IJob } from '@bilbomd/mongodb-schema'
import path from 'path'

const spawnFeedbackScript = async (DBjob: IJob): Promise<void> => {
  const resultsDir = path.join(config.uploadDir, DBjob.uuid, 'results')
  const logFile = path.join(resultsDir, 'feedback.log')
  const errorFile = path.join(resultsDir, 'feedback_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const scriptPath = '/app/scripts/pipeline_decision_tree.py'
  const args = [scriptPath, resultsDir]
  const opts = { cwd: resultsDir }

  return new Promise((resolve, reject) => {
    const runFeedbackScript: ChildProcess = spawn(
      '/opt/envs/base/bin/python',
      args,
      opts
    )

    runFeedbackScript.stdout?.on('data', (data) => {
      logger.info(`Feedback script stdout: ${data.toString()}`)
      logStream.write(data.toString())
    })

    runFeedbackScript.stderr?.on('data', (data) => {
      logger.error(`Feedback script stderr: ${data.toString()}`)
      errorStream.write(data.toString())
    })

    runFeedbackScript.on('error', (error) => {
      logger.error(`Feedback script error: ${error}`)
      reject(error)
    })

    runFeedbackScript.on('exit', async (code: number) => {
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]

      await Promise.all(closeStreamsPromises)

      if (code === 0) {
        logger.info(
          `Feedback script completed successfully with exit code ${code}`
        )

        // Read and save feedback.json to DBjob
        const feedbackFilePath = path.join(resultsDir, 'feedback.json')
        try {
          const feedbackData = await fs.promises.readFile(
            feedbackFilePath,
            'utf-8'
          )
          const feedbackJSON = JSON.parse(feedbackData)

          logger.info(
            `Parsed feedback data for job ${DBjob.uuid}: ${JSON.stringify(feedbackJSON)}`
          )

          // Update DBjob with feedback and save it
          DBjob.feedback = feedbackJSON
          await DBjob.save()

          logger.info(`Feedback data saved to MongoDB for job ${DBjob.uuid}`)
          resolve()
        } catch (err) {
          logger.error(
            `Failed to read or parse feedback.json for job ${DBjob.uuid}: ${err}`
          )
          reject(err)
        }
      } else {
        logger.error(`Feedback script failed with exit code ${code}`)
        reject(
          new Error('Feedback script failed. Please see the error log file.')
        )
      }
    })
  })
}

export { spawnFeedbackScript }
