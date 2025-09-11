import { spawn, ChildProcess } from 'node:child_process'
import { IJob } from '@bl1231/bilbomd-mongodb-schema'
import fs from 'fs-extra'
import path from 'node:path'
import { logger } from '../../helpers/loggers.js'
import { createInterface } from 'readline'
import { IStepStatus } from '@bl1231/bilbomd-mongodb-schema'
import { updateStepStatus } from './mongo-utils.js'
import { config } from '../../config/config.js'

const countDataPoints = async (filePath: string): Promise<number> => {
  const fileStream = fs.createReadStream(filePath)
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })
  let count = 0
  for await (const line of rl) {
    // Check that the line is not empty and does not start with a '#'
    if (line.trim() !== '' && !line.trim().startsWith('#')) {
      count++
    }
  }
  rl.close() // Explicitly close the readline interface
  logger.info(`countDataPoints original dat file has: ${count} points`)
  logger.info(`countDataPoints adjusting counts to: ${count - 1} points`)
  return count - 1
}

const runSingleFoXS = async (DBjob: IJob): Promise<void> => {
  let status: IStepStatus = {
    status: 'Running',
    message: 'Initial FoXS Calculations have started.'
  }
  try {
    await updateStepStatus(DBjob, 'initfoxs', status)
    const jobDir = path.join(config.uploadDir, DBjob.uuid)
    const logFile = path.join(jobDir, 'initial_foxs_analysis.log')
    const errorFile = path.join(jobDir, 'initial_foxs_analysis_error.log')
    const logStream = fs.createWriteStream(logFile)
    const errorStream = fs.createWriteStream(errorFile)

    let inputPDB: string
    if (!DBjob.md_engine || DBjob.md_engine === 'CHARMM') {
      inputPDB = 'minimization_output.pdb'
    } else if (DBjob.md_engine === 'OpenMM') {
      inputPDB = 'minimize/minimized.pdb'
    } else {
      inputPDB = 'minimization_output.pdb' // fallback for unknown engine
    }
    const inputDAT = DBjob.data_file
    const profileSize = await countDataPoints(path.join(jobDir, inputDAT))
    const foxsOpts = { cwd: jobDir }
    const foxsArgs = [
      '-o',
      '--min_c1=0.99',
      '--max_c1=1.05',
      '--min_c2=-0.50',
      '--max_c2=2.00',
      '--profile_size=' + profileSize,
      inputPDB,
      inputDAT
    ]
    logger.info(`runSingleFoXS foxsArgs: ${foxsArgs}`)

    const foxsProcess = () =>
      new Promise<void>((resolve, reject) => {
        const foxs: ChildProcess = spawn(config.foxBin, foxsArgs, foxsOpts)

        foxs.stdout?.on('data', (data) => {
          logStream.write(data.toString())
        })
        foxs.stderr?.on('data', (data) => {
          errorStream.write(data.toString())
        })
        foxs.on('error', (error) => {
          logger.error(`FoXS analysis error: ${error}`)
          errorStream.end()
          status = {
            status: 'Error',
            message: `FoXS analysis error with exit code: ${error}`
          }
          updateStepStatus(DBjob, 'initfoxs', status).then(() => reject(error))
        })
        foxs.on('exit', (code) => {
          Promise.all([
            new Promise((resolveStream) => logStream.end(resolveStream)),
            new Promise((resolveStream) => errorStream.end(resolveStream))
          ])
            .then(() => {
              if (code === 0) {
                logger.info(`FoXS analysis success with exit code: ${code}`)
                status = {
                  status: 'Success',
                  message: 'Initial FoXS Calculations have completed successfully.'
                }
                updateStepStatus(DBjob, 'initfoxs', status).then(resolve)
              } else {
                logger.error(`FoXS analysis error with exit code: ${code}`)
                status = {
                  status: 'Error',
                  message: `FoXS analysis error with exit code: ${code}`
                }
                updateStepStatus(DBjob, 'initfoxs', status).then(() =>
                  reject(new Error(`FoXS analysis error with exit code: ${code}`))
                )
              }
            })
            .catch((streamError) => {
              logger.error(`Error closing file streams: ${streamError}`)
              reject(streamError)
            })
        })
      })

    await foxsProcess()
  } catch (error) {
    status = {
      status: 'Error',
      message: `FoXS analysis error: ${error}`
    }
    await updateStepStatus(DBjob, 'initfoxs', status)
    logger.error(error)
  }
}

export { runSingleFoXS }
