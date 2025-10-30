import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'fs-extra'
import path from 'path'
import { IJob } from '@bilbomd/mongodb-schema'

const spawnRgyrDmaxScript = async (DBjob: IJob): Promise<void> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)
  const logFile = path.join(jobDir, 'rgyr_v_dmax.log')
  const errorFile = path.join(jobDir, 'rgyr_v_dmax_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const scriptPath = '/app/scripts/rgyr_v_dmax_analysis.py'
  const args = [scriptPath, jobDir]
  const opts = { cwd: jobDir }

  return new Promise((resolve, reject) => {
    const runRgyrDmaxScript: ChildProcess = spawn(
      '/opt/envs/base/bin/python',
      args,
      opts
    )

    runRgyrDmaxScript.stdout?.on('data', (data) => {
      logger.info(`Rgyr Dmax script stdout: ${data.toString()}`)
      logStream.write(data.toString())
    })

    runRgyrDmaxScript.stderr?.on('data', (data) => {
      logger.error(`Rgyr Dmax script stderr: ${data.toString()}`)
      errorStream.write(data.toString())
    })

    runRgyrDmaxScript.on('error', (error) => {
      logger.error(`Rgyr Dmax script error: ${error}`)
      reject(error)
    })

    runRgyrDmaxScript.on('exit', async (code: number) => {
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]

      await Promise.all(closeStreamsPromises)
      if (code === 0) {
        logger.info(
          `Rgyr Dmax script completed successfully with exit code ${code}`
        )
        resolve()
      } else {
        logger.error(`Rgyr Dmax script failed with exit code ${code}`)
        reject(
          new Error('Rgyr Dmax script failed. Please see the error log file.')
        )
      }
    })
  })
}
export { spawnRgyrDmaxScript }
