import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../helpers/loggers.js'
import fs from 'fs-extra'
import path from 'path'
import { spawn } from 'node:child_process'

const uploadFolder = process.env.DATA_VOL ?? '/bilbomd/uploads'
const CHARMM_BIN = process.env.CHARMM ?? '/usr/local/bin/charmm'

interface Pdb2CrdCharmmInputData {
  uuid: string
  pdb_file: string
}

const createPdb2CrdCharmmInpFiles = async (
  data: Pdb2CrdCharmmInputData
): Promise<string[]> => {
  logger.info(`in createCharmmInpFile: ${JSON.stringify(data)}`)
  const workingDir = path.join(uploadFolder, data.uuid)
  const inputPDB = path.join(workingDir, data.pdb_file)
  const logFile = path.join(workingDir, 'pdb2crd-python.log')
  const errorFile = path.join(workingDir, 'pdb2crd-python_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const pdb2crd_script = '/app/scripts/pdb2crd.py'
  const args = [pdb2crd_script, inputPDB, '.']

  return new Promise<string[]>((resolve, reject) => {
    const pdb2crd = spawn('/opt/envs/base/bin/python', args, {
      cwd: workingDir
    })

    pdb2crd.stdout.on('data', (data: Buffer) => {
      logStream.write(data.toString())
    })

    pdb2crd.stderr.on('data', (data: Buffer) => {
      const errorString = data.toString().trim()
      logger.error(`createCharmmInpFile stderr: ${errorString}`)
      errorStream.write(errorString + '\n')
    })

    pdb2crd.on('error', (error) => {
      logger.error(`createCharmmInpFile error: ${error}`)
      reject(error)
    })

    pdb2crd.on('close', (code) => {
      // Close streams explicitly once the process closes
      const closeStreamsPromises = [
        new Promise((resolveStream) => logStream.end(resolveStream)),
        new Promise((resolveStream) => errorStream.end(resolveStream))
      ]

      Promise.all(closeStreamsPromises)
        .then(() => {
          if (code === 0) {
            // Read the log file to extract the output filenames
            fs.readFile(logFile, 'utf8', (err, data) => {
              if (err) {
                logger.error(`Failed to read log file: ${err}`)
                reject(new Error('Failed to read log file'))
                return
              }

              const outputFiles: string[] = []
              const lines = data.split('\n')
              lines.forEach((line) => {
                line = line.trim()
                if (line) {
                  // Only process non-empty lines
                  logger.info(`inpFile: ${line}`)
                  outputFiles.push(line)
                }
              })

              logger.info(
                `Successfully parsed output files: ${outputFiles.join(', ')}`
              )
              resolve(outputFiles)
            })
          } else {
            logger.error(`createCharmmInpFile error with exit code: ${code}`)
            reject(
              new Error(`createCharmmInpFile error with exit code: ${code}`)
            )
          }
        })
        .catch((streamError) => {
          logger.error(`Error closing file streams: ${streamError}`)
          reject(new Error(`Error closing file streams: ${streamError}`))
        })
    })
  })
}
const spawnPdb2CrdCharmm = (
  MQJob: BullMQJob,
  inputFiles: string[]
): Promise<string[]> => {
  const workingDir = path.join(uploadFolder, MQJob.data.uuid)
  logger.info(`inputFiles for job ${MQJob.data.uuid}: ${inputFiles.join('\n')}`)

  // Create an array of promises, each promise corresponds to one charmm job
  const promises = inputFiles.map((inputFile) => {
    const outputFile = `${inputFile.split('.')[0]}.log`
    // logger.info(`in: ${inputFile} out: ${outputFile}`)
    const charmmArgs = ['-o', outputFile, '-i', inputFile]
    logger.info(`charmmArgs: ${charmmArgs}`)
    const charmmOpts = { cwd: workingDir }

    return new Promise<string>((resolve, reject) => {
      const charmm = spawn(CHARMM_BIN, charmmArgs, charmmOpts)
      let charmmOutput = ''

      charmm.stdout.on('data', (data) => {
        charmmOutput += data.toString()
      })

      charmm.stderr.on('data', (data) => {
        charmmOutput += data.toString()
      })

      charmm.on('error', (error) => {
        logger.error(
          `CHARMM process for file ${inputFile} encountered an error: ${error.message}`
        )
        reject(
          new Error(
            `CHARMM process for file ${inputFile} encountered an error: ${error.message}`
          )
        )
      })

      charmm.on('close', (code) => {
        if (code === 0) {
          MQJob.log(`pdb2crd done with ${inputFile}`)
          logger.info(
            `CHARMM execution succeeded: ${inputFile}, exit code: ${code}`
          )
          resolve(charmmOutput)
        } else {
          logger.error(
            `CHARMM execution failed: ${inputFile}, exit code: ${code}, error: ${charmmOutput}`
          )
          reject(
            new Error(
              `CHARMM execution failed: ${inputFile}, exit code: ${code}, error: ${charmmOutput}`
            )
          )
        }
      })
    })
  })

  return Promise.all(promises)
}

export { createPdb2CrdCharmmInpFiles, spawnPdb2CrdCharmm }
