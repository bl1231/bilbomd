import { exec } from 'node:child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
import { IStepStatus, IJob } from '@bilbomd/mongodb-schema'
import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { updateStepStatus } from './mongo-utils.js'
import { makeDir, handleError } from './job-utils.js'

const execPromise = promisify(exec)

const makeFoxsDatFileList = async (dir: string) => {
  const stdOut = path.join(dir, 'foxs_dat_files.txt')
  const stdErr = path.join(dir, 'foxs_dat_files_errors.txt')
  const stdoutStream = fs.createWriteStream(stdOut)
  const errorStream = fs.createWriteStream(stdErr)

  try {
    const { stdout, stderr } = await execPromise('ls -1 ../foxs/*/*.pdb.dat', {
      cwd: dir
    })

    // Use 'end' to ensure the stream is closed after writing
    stdoutStream.end(stdout)
    errorStream.end(stderr)

    // Wait for both streams to finish writing and closing
    await Promise.all([
      new Promise<void>((resolve, reject) =>
        stdoutStream
          .on('finish', () => resolve())
          .on('error', (err) => reject(err))
      ),
      new Promise<void>((resolve, reject) =>
        errorStream
          .on('finish', () => resolve())
          .on('error', (err) => reject(err))
      )
    ])
  } catch (error) {
    logger.error(`Error generating foxs_dat_files list ${error}`)
    // It's important to close the streams even in case of an error to free up the resources
    stdoutStream.end()
    errorStream.end()
  }
}

const spawnMultiFoxs = async (params: MultiFoxsParams): Promise<void> => {
  const multiFoxsDir = path.join(params.out_dir, 'multifoxs')
  await runProcess({
    label: 'MultiFoXS',
    cmd: config.multifoxsBin,
    args: [
      '-o',
      path.join(params.out_dir, params.data_file),
      'foxs_dat_files.txt'
    ],
    cwd: multiFoxsDir,
    stdoutFile: path.join(multiFoxsDir, 'multi_foxs.log'),
    stderrFile: path.join(multiFoxsDir, 'multi_foxs_error.log'),
    timeoutMs: config.processTimeouts.multifoxsMs
  })
  logger.info('spawnMultiFoxs completed successfully')
}

const runMultiFoxs = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  const outputDir = path.join(config.uploadDir, DBjob.uuid)
  const multifoxsParams: MultiFoxsParams = {
    out_dir: outputDir,
    data_file: DBjob.data_file
  }
  try {
    logger.info(`Starting MultiFoXS for job ${DBjob.uuid}`)
    let status: IStepStatus = {
      status: 'Running',
      message: 'MultiFoXS Calculations have started.'
    }
    await updateStepStatus(DBjob, 'multifoxs', status)
    const multiFoxsDir = path.join(multifoxsParams.out_dir, 'multifoxs')
    await makeDir(multiFoxsDir)
    await makeFoxsDatFileList(multiFoxsDir)
    await spawnMultiFoxs(multifoxsParams)
    status = {
      status: 'Success',
      message: 'MultiFoXS Calculations have completed.'
    }
    await updateStepStatus(DBjob, 'multifoxs', status)
    logger.info(`Completed MultiFoXS for job ${DBjob.uuid}`)
  } catch (error) {
    await handleError(error, DBjob, 'multifoxs')
  }
}

export { runMultiFoxs, spawnMultiFoxs }
