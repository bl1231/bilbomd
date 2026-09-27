import { IJob } from '@bilbomd/mongodb-schema'
import fs from 'fs-extra'
import path from 'node:path'
import { logger } from '../../helpers/loggers.js'
import { createInterface } from 'readline'
import { IStepStatus } from '@bilbomd/mongodb-schema'
import { updateStepStatus } from './mongo-utils.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import { getErrorMessage } from '../../helpers/errors.js'

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

    let inputPDB: string
    if (!DBjob.md_engine || DBjob.md_engine === 'CHARMM') {
      inputPDB = 'charmm/minimize/minimization_output.pdb'
    } else if (DBjob.md_engine === 'OpenMM') {
      inputPDB = 'openmm/minimize/minimized.pdb'
    } else {
      inputPDB = 'minimization_output.pdb' // fallback for unknown engine
    }
    const inputDAT = DBjob.data_file
    const profileSize = await countDataPoints(path.join(jobDir, inputDAT))
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

    await runProcess({
      label: 'Initial FoXS',
      cmd: config.foxBin,
      args: foxsArgs,
      cwd: jobDir,
      stdoutFile: path.join(jobDir, 'initial_foxs_analysis.log'),
      stderrFile: path.join(jobDir, 'initial_foxs_analysis_error.log'),
      timeoutMs: config.processTimeouts.foxsMs
    })
    logger.info('Initial FoXS analysis succeeded')
    status = {
      status: 'Success',
      message: 'Initial FoXS Calculations have completed successfully.'
    }
    await updateStepStatus(DBjob, 'initfoxs', status)
  } catch (error) {
    status = {
      status: 'Error',
      message: `FoXS analysis error: ${getErrorMessage(error)}`
    }
    await updateStepStatus(DBjob, 'initfoxs', status)
    logger.error(error)
  }
}

export { runSingleFoXS }
