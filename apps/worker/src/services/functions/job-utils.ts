import {
  User,
  IUser,
  IJob,
  IStepStatus,
  IBilboMDSteps,
  BilboMdAutoJob
} from '@bilbomd/mongodb-schema'
import { Job as BullMQJob } from 'bullmq'
import { logger } from '../../helpers/loggers.js'
import { sendJobCompleteEmail } from '../../helpers/mailer.js'
import { config } from '../../config/config.js'
import fs from 'fs-extra'
import { CharmmDCD2PDBParams, CharmmParams } from '../../types/index.js'
import path from 'path'
import { spawn, ChildProcess } from 'node:child_process'
import Handlebars from 'handlebars'
import { updateStepStatus, updateJobStatus } from './mongo-utils.js'

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

const initializeJob = async (MQJob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    // Make sure the user exists in MongoDB
    const foundUser = await User.findById(DBjob.user).lean().exec()
    if (!foundUser) {
      throw new Error(`No user found for: ${DBjob.uuid}`)
    }

    // Clear the BullMQ Job logs in the case this job is being re-run
    await MQJob.clearLogs()

    // Set MongoDB status to Running when we are submitting to Slurm at NERSC
    // Does this need to be set to Running when we are running locally?6
    DBjob.status = 'Running'
    // DBjob.time_started = new Date()
    await DBjob.save()
  } catch (error) {
    // Handle and log the error
    logger.error(`Error in initializeJob: ${error}`)
    throw error
  }
}

const cleanupJob = async (MQjob: BullMQJob, DBjob: IJob): Promise<void> => {
  try {
    // Mark job as completed in the database
    await markJobAsCompleted(DBjob)

    // Fetch user associated with the job
    const user = await fetchJobUser(DBjob)
    if (!user) {
      logger.error(`No user found for: ${DBjob.uuid}`)
      return
    }

    // Handle email notifications
    await handleJobEmailNotification(MQjob, DBjob, user)
  } catch (error) {
    logger.error(`Error in cleanupJob: ${error}`)
    throw error
  }
}

// Mark job as completed
const markJobAsCompleted = async (DBjob: IJob): Promise<void> => {
  DBjob.status = 'Completed'
  DBjob.time_completed = new Date()
  await DBjob.save()
}

// Fetch user associated with the job
const fetchJobUser = async (DBjob: IJob): Promise<IUser | null> => {
  return User.findById(DBjob.user).lean<IUser>().exec()
}

// Handle email notifications
const handleJobEmailNotification = async (
  MQjob: BullMQJob,
  DBjob: IJob,
  user: IUser
): Promise<void> => {
  if (config.sendEmailNotifications) {
    let status: IStepStatus = {
      status: 'Running',
      message: `Sending email to: ${user.email}`
    }
    await updateStepStatus(DBjob, 'email', status)

    try {
      sendJobCompleteEmail(
        user.email,
        config.bilbomdUrl,
        DBjob.id,
        DBjob.title,
        false
      )
      logger.info(`Email notification sent to ${user.email}`)
      await MQjob.log(`Email notification sent to ${user.email}`)

      status = {
        status: 'Success',
        message: `Email sent to: ${user.email}`
      }
      await updateStepStatus(DBjob, 'email', status)
    } catch (emailError) {
      logger.error(
        `Failed to send email to ${user.email}: ${getErrorMessage(emailError)}`
      )
      status = {
        status: 'Error',
        message: `Failed to send email: ${getErrorMessage(emailError)}`
      }
      await updateStepStatus(DBjob, 'email', status)
    }
  } else {
    logger.info(`Skipping email notification for ${user.email}`)
  }
}

const makeDir = async (directory: string) => {
  await fs.ensureDir(directory)
  logger.info(`Create Dir: ${directory}`)
}

const makeFile = async (file: string) => {
  await fs.ensureFile(file)
}

const generateDCD2PDBInpFile = async (
  params: CharmmDCD2PDBParams,
  rg: number,
  run: number
) => {
  params.in_dcd = `dynamics_rg${rg}_run${run}.dcd`
  await generateInputFile(params)
}

const writeInputFile = async (
  template: string,
  params: CharmmParams
): Promise<void> => {
  try {
    const outFile = path.join(params.out_dir, params.charmm_inp_file)
    const templ = Handlebars.compile(template)
    const content = templ(params)

    logger.info(`Write Input File: ${outFile}`)
    await fs.promises.writeFile(outFile, content)
  } catch (error) {
    logger.error(`Error in writeInputFile: ${error}`)
    throw error
  }
}

const readTemplate = async (templateName: string): Promise<string> => {
  try {
    const templateFile = path.join(
      config.charmmTemplateDir,
      `${templateName}.handlebars`
    )
    const content = await fs.readFile(templateFile, 'utf8')
    return content
  } catch (error) {
    logger.error(
      `Error in readTemplate for ${templateName}: ${getErrorMessage(error)}`
    )
    throw error
  }
}

const generateInputFile = async (params: CharmmParams): Promise<void> => {
  logger.info(`Generating input file for: ${params.charmm_inp_file}`)
  const templateString = await readTemplate(params.charmm_template)
  await writeInputFile(templateString, params)
}

const spawnCharmm = (
  params: CharmmParams,
  MQjob?: BullMQJob
): Promise<void> => {
  const {
    charmm_inp_file: inputFile,
    charmm_out_file: outputFile,
    out_dir
  } = params
  const charmmArgs = ['-o', outputFile, '-i', inputFile]
  const charmmOpts = { cwd: out_dir }

  return new Promise<void>((resolve, reject) => {
    const charmm: ChildProcess = spawn(config.charmmBin, charmmArgs, charmmOpts)
    let charmmOutput = ''
    let heartbeat: NodeJS.Timeout | null = null

    // Start a heartbeat timer (e.g., every 20 seconds)
    if (MQjob) {
      heartbeat = setInterval(() => {
        MQjob.updateProgress({ status: 'running', timestamp: Date.now() })
        MQjob.log(`Heartbeat: still running ${inputFile}`)
        logger.info(
          `CHARMM Heartbeat: still running ${inputFile} at ${new Date().toLocaleString(
            'en-US',
            { timeZone: 'America/Los_Angeles' }
          )}`
        )
      }, 10_000)
    }

    charmm.stdout?.on('data', (data) => {
      charmmOutput += data.toString()
    })

    charmm.on('error', (error) => {
      if (heartbeat) clearInterval(heartbeat)
      reject(new Error(`CHARMM process encountered an error: ${error.message}`))
    })

    charmm.on('close', (code: number) => {
      if (heartbeat) clearInterval(heartbeat)
      if (code === 0) {
        logger.info(`CHARMM success: ${inputFile} exit code: ${code}`)
        resolve()
      } else {
        logger.info(`CHARMM error: ${inputFile} exit code: ${code}`)
        reject(new Error(charmmOutput))
      }
    })
  })
}

const spawnFoXS = async (
  foxsRunDir: string,
  MQjob?: BullMQJob
): Promise<void> => {
  try {
    const files = await fs.readdir(foxsRunDir)
    logger.info(`Spawn FoXS jobs: ${foxsRunDir}`)
    const foxsOpts = { cwd: foxsRunDir }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      await new Promise<void>((resolve, reject) => {
        const foxsArgs = ['-p', file]
        const foxs: ChildProcess = spawn(config.foxBin, foxsArgs, foxsOpts)

        foxs.on('exit', (code) => {
          if (code === 0) {
            // Log every N files
            if (MQjob && i % 20 === 0) {
              MQjob.updateProgress({
                status: `FoXS processing: ${i + 1}/${files.length}`,
                timestamp: Date.now()
              })
              MQjob.log(`FoXS progress: ${i + 1}/${files.length}`)
              logger.info(`FoXS progress: ${i + 1}/${files.length}`)
            }
            resolve()
          } else {
            reject(
              new Error(`FoXS process for ${file} exited with code ${code}`)
            )
          }
        })

        foxs.on('error', (error) => {
          reject(new Error(`FoXS process error for ${file}: ${error.message}`))
        })
      })
    }
  } catch (error) {
    logger.error(`FoXS error in ${foxsRunDir}: ${error}`)
    throw error
  }
}

const handleError = async (
  error: Error | unknown,
  MQjob: BullMQJob,
  DBjob: IJob,
  step?: keyof IBilboMDSteps
) => {
  // Enhanced error message extraction
  let errorMsg: string
  let stackTrace: string | undefined

  if (error instanceof Error) {
    errorMsg = error.message
    stackTrace = error.stack
    logger.error(
      `handleError - Error object details: name=${error.name}, message=${error.message}, stack=${error.stack}, step=${step || 'unknown'}`
    )
  } else {
    errorMsg = String(error)
    logger.error(
      `handleError - Non-Error object: error=${error}, type=${typeof error}, step=${step || 'unknown'}`
    )
  }

  // Log the step and error details
  logger.error(
    `handleError called for step: ${step || 'undefined'} with error: ${errorMsg}`
  )

  if (stackTrace) {
    logger.error(`Stack trace: ${stackTrace}`)
  }

  // Log job details for context
  logger.error(
    `Job context: jobId=${DBjob.id}, jobUuid=${DBjob.uuid}, jobTitle=${DBjob.title}, jobType=${DBjob.__t}, currentStatus=${DBjob.status}, mqJobId=${MQjob.id}, mqJobName=${MQjob.name}, attemptsMade=${MQjob.attemptsMade}`
  )

  try {
    // Updates primary status in MongoDB
    logger.debug(`Updating job status to 'Error' for job ${DBjob.id}`)
    await updateJobStatus(DBjob, 'Error')
    logger.debug(`Successfully updated job status to 'Error'`)
  } catch (updateError) {
    logger.error(`Failed to update job status: ${updateError}`)
  }

  // Update the specific step status
  if (step) {
    try {
      const status: IStepStatus = {
        status: 'Error',
        message: `Error in step ${step}: ${errorMsg}`
      }
      logger.debug(`Updating step status for step: ${step}`)
      await updateStepStatus(DBjob, step, status)
      logger.debug(`Successfully updated step status for step: ${step}`)
    } catch (stepUpdateError) {
      logger.error(
        `Failed to update step status for step ${step}: ${stepUpdateError}`
      )
    }
  } else {
    logger.error(`Step not provided when handling error. Error: ${errorMsg}`)
  }

  // Log to MQ job
  try {
    await MQjob.log(`ERROR: ${errorMsg}`)
    if (stackTrace) {
      await MQjob.log(`Stack trace: ${stackTrace}`)
    }
    logger.debug(`Successfully logged error to MQ job`)
  } catch (mqLogError) {
    logger.error(`Failed to log to MQ job: ${mqLogError}`)
  }

  // Send job completion email and log the notification
  logger.info(`Failed Attempts: ${MQjob.attemptsMade}`)

  try {
    const recipientEmail = (DBjob.user as IUser).email
    logger.debug(`Recipient email: ${recipientEmail}`)

    if (MQjob.attemptsMade >= 3) {
      if (config.sendEmailNotifications) {
        logger.debug(`Sending failure email notification to ${recipientEmail}`)
        await sendJobCompleteEmail(
          recipientEmail,
          config.bilbomdUrl,
          DBjob.id,
          DBjob.title,
          true
        )
        logger.warn(`Email notification sent to ${recipientEmail}`)
        await MQjob.log(`Email notification sent to ${recipientEmail}`)
      } else {
        logger.debug(`Email notifications are disabled`)
      }
    } else {
      logger.debug(`Not sending email - attempts (${MQjob.attemptsMade}) < 3`)
    }
  } catch (emailError) {
    logger.error(`Failed to send email notification: ${emailError}`)
  }

  // Create a more descriptive error to throw
  const finalError = new Error(
    `BilboMD failed in step '${step || 'unknown'}': ${errorMsg}`
  )
  logger.error(`Throwing final error: ${finalError.message}`)
  throw finalError
}

const awaitCrdsReady = async (
  DBjob: IJob,
  maxWaitMs = 60000,
  pollIntervalMs = 2000
): Promise<void> => {
  const start = Date.now()
  let attempt = 0
  while (true) {
    attempt++
    logger.info(
      `awaitCrdsReady poll #${attempt} for job ${DBjob._id}: checking for CRD/PSF files...`
    )
    // Re-fetch the job from the database to get updated fields
    const freshJob = await BilboMdAutoJob.findOne({ _id: DBjob._id }).exec()
    if (freshJob && typeof freshJob.populate === 'function')
      await freshJob.populate('user')
    if (freshJob && freshJob.crd_file && freshJob.psf_file) {
      logger.info(
        `CRD/PSF files found for job ${DBjob._id} after ${attempt} poll(s)`
      )
      return
    }
    if (Date.now() - start > maxWaitMs)
      throw new Error('Timed out waiting for CRD/PSF files')
    await new Promise((res) => setTimeout(res, pollIntervalMs))
  }
}

export {
  initializeJob,
  cleanupJob,
  makeDir,
  makeFile,
  generateDCD2PDBInpFile,
  generateInputFile,
  spawnCharmm,
  spawnFoXS,
  handleError,
  awaitCrdsReady
}
