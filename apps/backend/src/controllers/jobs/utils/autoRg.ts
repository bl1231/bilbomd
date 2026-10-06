import { logger } from '../../../middleware/loggers.js'
import { v4 as uuid } from 'uuid'
import {
  createUpload,
  getUploadErrorResponse
} from '../../../middleware/upload.js'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { Request, Response } from 'express'
import { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import { AutoRgResults } from '../../../types/bilbomd.js'
import { getEnvVar } from '../../../config/config.js'
import { isQUnits, Q_UNITS } from '@bilbomd/bilbomd-types'
import { prepareSaxsDataFile } from './saxsData.js'

const uploadFolder = path.join(getEnvVar('DATA_VOL'))

// Matches the dat_file limit in the job validation schemas.
const MAX_DAT_FILE_SIZE = 2_000_000

const getAutoRg = async (req: Request, res: Response) => {
  const UUID = uuid()
  const jobDir = path.join(uploadFolder, 'autorg_uploads', UUID)
  try {
    await fs.mkdir(jobDir, { recursive: true })
    logger.info(`Create temporary AutoRg directory: ${jobDir}`)

    const upload = createUpload({
      destination: jobDir,
      filename: () => 'expdata.dat',
      maxFileSize: MAX_DAT_FILE_SIZE
    })
    upload.single('dat_file')(req, res, async (err) => {
      if (err) {
        logger.error(err)
        await fs.remove(jobDir)
        const { status, message } = getUploadErrorResponse(err)
        return res.status(status).json({ message })
      }

      try {
        // SAXS forms send q_units (even if just "auto"); the file then gets
        // the same unit conversion and trimming a job submission applies, so
        // the suggested Rg matches the data the job will run on. Requests
        // without q_units (SANS) are analyzed as uploaded.
        const qUnits: unknown = req.body?.q_units
        let saxsWarnings: string[] = []
        if (qUnits !== undefined && qUnits !== '') {
          if (!isQUnits(qUnits)) {
            await fs.remove(jobDir)
            return res.status(400).json({
              message: `q_units must be one of: ${Q_UNITS.join(', ')}`
            })
          }
          const saxsData = await prepareSaxsDataFile(req.file, qUnits)
          if (!saxsData.ok) {
            await fs.remove(jobDir)
            return res.status(400).json({ message: saxsData.message })
          }
          saxsWarnings = saxsData.warnings
        }

        const autorgResults: AutoRgResults = await spawnAutoRgCalculator(
          jobDir,
          'expdata.dat'
        )
        logger.info(`autorgResults: ${JSON.stringify(autorgResults)}`)

        res.status(200).json({
          message: 'AutoRg Success',
          uuid: UUID,
          rg: autorgResults.rg,
          rg_min: autorgResults.rg_min,
          rg_max: autorgResults.rg_max,
          qmin: autorgResults.qmin,
          qmax: autorgResults.qmax,
          rg_exact: autorgResults.rg_exact,
          i0: autorgResults.i0,
          r2: autorgResults.r2,
          saxs_warnings: saxsWarnings
        })
        // await new Promise((resolve) => setTimeout(resolve, 5000))
        // Not sure if this is a NetApp issue or a Docker issue, but sometimes this fails
        // because there are dangling NFS lock files present.
        // This complicated bit of code is an attempt to make fs.remove more robust.
        const maxAttempts = 10
        let attempt = 0
        const baseDelay = 1000
        while (attempt < maxAttempts) {
          try {
            logger.info(`Call fs.remove on ${jobDir}`)
            await fs.remove(jobDir)
            logger.info(`Removed ${jobDir}`)
            break // Exit loop if successful
          } catch (error) {
            if (
              error instanceof Error &&
              typeof error === 'object' &&
              error !== null &&
              'code' in error
            ) {
              if (error.code === 'ENOTEMPTY' || error.code === 'EBUSY') {
                // Calculate the delay for the current attempt, doubling it each time
                const delay = baseDelay * Math.pow(2, attempt)
                logger.warn(
                  `Attempt ${attempt + 1} to remove directory failed ${
                    error.code
                  }, retrying...`
                )
                // Wait for the calculated delay before the next attempt
                await new Promise((resolve) => setTimeout(resolve, delay))
                attempt++
              } else {
                // Re-throw if it's an unexpected error
                throw error
              }
            } else {
              logger.error(error)
            }
          }
        }
      } catch (error) {
        logger.error(`Error calculating AutoRg: ${error}`)
        res
          .status(500)
          .json({ message: 'Failed to calculate AutoRg', error: error })
      }
    })
  } catch (error) {
    logger.error(error)
    res.status(500).json({ message: 'Failed to create AutoRg job directory' })
  }
}

const spawnAutoRgCalculator = async (
  dir: string,
  datFileName: string
): Promise<AutoRgResults> => {
  const logFile = path.join(dir, 'autoRg.log')
  const errorFile = path.join(dir, 'autoRg_error.log')
  const logStream = fs.createWriteStream(logFile)
  const errorStream = fs.createWriteStream(errorFile)
  const autoRg_script = '/app/scripts/autorg.py'
  const tempOutputFile = path.join(os.tmpdir(), `autoRg_${Date.now()}.json`)
  const args = [autoRg_script, datFileName, tempOutputFile]

  return new Promise<AutoRgResults>((resolve, reject) => {
    const autoRg: ChildProcess = spawn('python', args, { cwd: dir })

    autoRg.stdout?.on('data', (data: Buffer) => {
      const dataString = data.toString().trim()
      const suppressMessage =
        "module 'scipy.integrate' has no attribute 'trapz'"

      // Check if the message should be suppressed
      if (dataString.includes(suppressMessage)) {
        logger.info(`Suppressed message: ${suppressMessage}`)
        return
      }

      logger.info(`spawnAutoRgCalculator stdout: ${dataString}`)
      logStream.write(dataString + '\n')
    })

    autoRg.stderr?.on('data', (data: Buffer) => {
      const dataString = data.toString().trim()
      logger.error(`spawnAutoRgCalculator stderr: ${dataString}`)
      errorStream.write(dataString + '\n')
    })

    autoRg.on('error', (error) => {
      const wrapped = error instanceof Error ? error : new Error(String(error))
      logger.error(
        `spawnAutoRgCalculator error: ${wrapped.stack || wrapped.message}`
      )
      reject(wrapped)
    })

    autoRg.on('exit', async (code) => {
      logStream.end()
      errorStream.end()

      if (code === 0) {
        try {
          const fileContent = await fs.promises.readFile(
            tempOutputFile,
            'utf-8'
          )
          const analysisResults = JSON.parse(fileContent)
          logger.info(`spawnAutoRgCalculator success with exit code: ${code}`)
          resolve(analysisResults)
        } catch (parseError) {
          const msg =
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          logger.error(`Error parsing autoRg output file: ${msg}`)
          reject(new Error(`Failed to parse autoRg output: ${msg}`))
        }
      } else {
        const message = `AutoRg exited with code ${code}. datFileName=${datFileName} tempOutput=${tempOutputFile}`
        logger.error(`spawnAutoRgCalculator failure: ${message}`)
        reject(new Error(message))
      }
    })
  })
}

export { getAutoRg, spawnAutoRgCalculator }
