import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { Job as BullMQJob } from 'bullmq'
import { IBilboMDScoperJob } from './model/Job.js'

const DATA_VOL = process.env.DATA_VOL ?? '/bilbomd/uploads'
const SCOPER_SCRIPT = process.env.SCOPER_SCRIPT ?? '/home/bun/app/scripts/run_scoper.py'

const runScoper = async (MQjob: BullMQJob, DBjob: IBilboMDScoperJob): Promise<void> => {
  const outputDir = path.join(DATA_VOL, DBjob.uuid)
  const logFile = path.join(outputDir, 'scoper.log')
  const errorFile = path.join(outputDir, 'scoper_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const args = [SCOPER_SCRIPT, DBjob.pdb_file, DBjob.data_file]
  return new Promise<void>((resolve, reject) => {
    const scoper = spawn('python', args, { cwd: outputDir })

    scoper.stdout?.on('data', (data) => {
      logStream.write(data.toString())
    })

    scoper.stderr?.on('data', (data) => {
      errorStream.write(data.toString())
    })

    scoper.on('error', (error) => {
      errorStream.end()
      reject(error)
    })

    scoper.on('exit', (code) => {
      logStream.end()
      errorStream.end()
      if (code === 0) {
        console.log('exit code zero ----- here')
        resolve()
      } else {
        reject(`runScoper on close reject`)
      }
    })
  })
}

export { runScoper }
